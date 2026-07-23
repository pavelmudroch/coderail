#!/usr/bin/env sh

set -eu

script_path=$0

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$script_path")"
    pwd
)

ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/../../.."
    pwd
)

. "$ROOT_DIR/lib/utils/ticket.sh"
. "$ROOT_DIR/lib/utils/work.sh"
. "$ROOT_DIR/lib/utils/config.sh"

usage() {
    cat <<'EOF'
Usage:
  cr work finish

  Finish the current work. Requires all tickets to be closed, no git unstaged
  changes or untracked files. Cleans up stale coderail files and merges squashed
  back to initial branch.

Options:
  -h, --help            Show this help message and exit
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

fatal() {
    echo "error: $*" >&2
    exit 1
}

automatic_commit_failure() {
    fatal "automatic commit failed: $*"
}

prompt_yes_no() {
    prompt=$1

    while :; do
        printf '%s [Y/n] ' "$prompt"
        if ! IFS= read -r response; then
            return 1
        fi

        response=$(printf '%s' "$response" | tr '[:upper:]' '[:lower:]')
        case "$response" in
            ''|y|yes)
                return 0
                ;;
            n|no)
                return 1
                ;;
            *)
                echo 'Please answer yes or no.'
                ;;
        esac
    done
}

select_commit_tool() {
    load_default_tool

    if [ -n "$default_tool" ]; then
        selected_tool=$default_tool
        case "$selected_tool" in
            codex|copilot|claude|gemini)
                ;;
            *)
                automatic_commit_failure "unknown configured tool: $selected_tool"
                ;;
        esac
    else
        printf '%s' 'Select commit tool (codex, copilot, claude, gemini): '
        if ! IFS= read -r selected_tool; then
            return 1
        fi

        case "$selected_tool" in
            codex|copilot|claude|gemini)
                ;;
            *)
                return 1
                ;;
        esac
    fi

    command -v "$selected_tool" >/dev/null 2>&1 ||
        automatic_commit_failure "tool is unavailable: $selected_tool"
}

invoke_commit_agent() {
    case "$selected_tool" in
        codex)
            "$selected_tool" --sandbox workspace-write \
                -c 'sandbox_workspace_write.network_access=true' \
                exec '$cr-commit'
            ;;
        claude)
            "$selected_tool" --dangerously-skip-permissions -p '/cr-commit'
            ;;
        gemini)
            "$selected_tool" --approval-mode=yolo -p '/cr-commit'
            ;;
        copilot)
            "$selected_tool" --yolo -p '/cr-commit'
            ;;
        *)
            automatic_commit_failure "unsupported tool: $selected_tool"
            ;;
    esac
}

parse_commit_message() {
    awk '
        $0 == "Commit:" {
            if (commit_started) {
                exit 1
            }
            commit_started = 1
            next
        }
        $0 == "Command:" {
            if (!commit_started) {
                exit 1
            }
            command_started = 1
            exit
        }
        commit_started {
            lines[++line_count] = $0
        }
        END {
            if (!commit_started || !command_started) {
                exit 1
            }

            while (line_count > 0 && lines[1] ~ /^[[:space:]]*$/) {
                for (line_index = 1; line_index < line_count; line_index++) {
                    lines[line_index] = lines[line_index + 1]
                }
                line_count--
            }
            while (line_count > 0 && lines[line_count] ~ /^[[:space:]]*$/) {
                line_count--
            }

            if (line_count == 0) {
                exit 1
            }

            for (line_index = 1; line_index <= line_count; line_index++) {
                print lines[line_index]
            }
        }
    ' "$agent_output" > "$commit_message_file"
}

collect_managed_paths() {
    managed_ref=$1

    git ls-tree -r --name-only "$managed_ref" -- .coderail |
        while IFS= read -r managed_path || [ -n "$managed_path" ]; do
            case "$managed_path" in
                .coderail/conf.ini|.coderail/test.map)
                    ;;
                .coderail/*)
                    printf '%s\n' "$managed_path"
                    ;;
            esac
        done
}

path_is_listed() {
    listed_paths=$1
    expected_path=$2

    grep -F -x -- "$expected_path" "$listed_paths" >/dev/null
}

restore_base_managed_paths() {
    while IFS= read -r base_managed_path || [ -n "$base_managed_path" ]; do
        [ -n "$base_managed_path" ] || continue

        git restore --source=HEAD --staged --worktree -- "$base_managed_path" ||
            fatal "failed to restore base workflow file: $base_managed_path"
    done < "$base_managed_paths"
}

remove_child_only_managed_paths() {
    while IFS= read -r work_managed_path || [ -n "$work_managed_path" ]; do
        [ -n "$work_managed_path" ] || continue
        path_is_listed "$base_managed_paths" "$work_managed_path" && continue

        git rm --quiet --force --ignore-unmatch --cached -- "$work_managed_path" ||
            fatal "failed to remove work workflow file: $work_managed_path"
        rm -f "$work_managed_path" ||
            fatal "failed to remove work workflow file: $work_managed_path"
    done < "$work_managed_paths"
}

return_to_work_branch() {
    git switch --quiet "$recorded_work_branch"
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        --*)
            error "unknown option: $1"
            ;;
        -*)
            error "unknown option: $1"
            ;;
        *)
            error "unexpected argument: $1"
            ;;
    esac
done

[ "$#" -eq 0 ] || error "unexpected argument: $1"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fatal "work finish requires a Git repository"

[ -d .coderail ] ||
    fatal "coderail directory not found: .coderail; run cr init before proceeding"

current_branch=$(git branch --show-current) ||
    fatal "failed to determine current branch"
[ -n "$current_branch" ] ||
    fatal "work finish requires a named current branch"

work_read_record .coderail/work.ini ||
    fatal "work record is invalid: .coderail/work.ini"

recorded_base_branch=$work_base_branch
recorded_work_branch=$work_branch
recorded_work_name=$work_name

[ "$current_branch" = "$recorded_work_branch" ] ||
    fatal "current branch does not match work record: $recorded_work_branch"

git show-ref --verify --quiet "refs/heads/$recorded_base_branch" ||
    fatal "base branch not found: $recorded_base_branch"

untracked_files=$(git ls-files --others --exclude-standard) ||
    fatal "failed to query Git worktree"
[ -z "$untracked_files" ] ||
    fatal "work finish requires no untracked files"

if git diff --quiet; then
    :
else
    unstaged_status=$?
    [ "$unstaged_status" -eq 1 ] || fatal "failed to query Git worktree"
    fatal "work finish requires no unstaged changes"
fi

TEMP_DIR=${TMPDIR:-/tmp}
TEMP_DIR=${TEMP_DIR%/}
tmp_dir=$(mktemp -d "$TEMP_DIR/coderail-work-finish.XXXXXX") ||
    fatal "failed to create temporary directory"

cleanup() {
    rm -rf "$tmp_dir"
}
trap cleanup EXIT HUP INT TERM

ticket_files=$tmp_dir/ticket-files
work_managed_paths=$tmp_dir/work-managed-paths
base_managed_paths=$tmp_dir/base-managed-paths
committed_record=$tmp_dir/work.ini
squash_unmerged_paths=$tmp_dir/squash-unmerged-paths
agent_output=$tmp_dir/agent-output
commit_message_file=$tmp_dir/commit-message

ticket_collect_files . "$ticket_files" "$tmp_dir" ||
    fatal "failed to collect tickets"
ticket_validate_all_resolved . "$ticket_files" "$tmp_dir" || exit 1

if git diff --cached --quiet; then
    :
else
    staged_status=$?
    [ "$staged_status" -eq 1 ] || fatal "failed to query Git index"
    git commit -q -m 'chore(work): save work progress' ||
        fatal "failed to checkpoint staged work"
fi

git show "$recorded_work_branch:.coderail/work.ini" > "$committed_record" ||
    fatal "failed to read committed work record"
work_read_record "$committed_record" ||
    fatal "committed work record is invalid"
[ "$work_base_branch" = "$recorded_base_branch" ] &&
    [ "$work_branch" = "$recorded_work_branch" ] &&
    [ "$work_name" = "$recorded_work_name" ] ||
    fatal "committed work record does not match current work"

collect_managed_paths "$recorded_work_branch" > "$work_managed_paths" ||
    fatal "failed to capture work workflow files"

git switch --quiet "$recorded_base_branch" ||
    fatal "failed to switch to base branch: $recorded_base_branch"

base_worktree_status=$(git status --porcelain --untracked-files=all) ||
    fatal "failed to query base worktree"
if [ -n "$base_worktree_status" ]; then
    if return_to_work_branch; then
        fatal "base branch must be clean before integrating work"
    else
        fatal "base branch must be clean before integrating work; failed to return to work branch"
    fi
fi

collect_managed_paths HEAD > "$base_managed_paths" ||
    fatal "failed to capture base workflow files"

if git merge --quiet --squash --no-commit "$recorded_work_branch"; then
    squash_status=0
else
    squash_status=$?
fi

git diff --name-only --diff-filter=U > "$squash_unmerged_paths" ||
    fatal "failed to inspect squash conflicts"

restore_base_managed_paths
remove_child_only_managed_paths

unmerged_paths=$(git diff --name-only --diff-filter=U) ||
    fatal "failed to inspect squash conflicts"
if [ -n "$unmerged_paths" ]; then
    git reset --merge ||
        fatal "failed to reset conflicted squash integration"
    if return_to_work_branch; then
        fatal "squash integration has conflicts; merge the base branch into the work branch before retrying"
    else
        fatal "squash integration has conflicts; merge the base branch into the work branch before retrying; failed to return to work branch"
    fi
fi

if [ "$squash_status" -ne 0 ] && [ ! -s "$squash_unmerged_paths" ]; then
    git reset --merge ||
        fatal "failed to reset incomplete squash integration"
    if return_to_work_branch; then
        fatal "failed to prepare squash integration"
    else
        fatal "failed to prepare squash integration; failed to return to work branch"
    fi
fi

if git diff --cached --quiet; then
    echo "work produced no integration changes"
    exit 0
else
    integration_status=$?
fi
[ "$integration_status" -eq 1 ] ||
    fatal "failed to inspect squash integration"

echo "integration changes are staged on $recorded_base_branch"

if ! prompt_yes_no 'Create integration commit automatically?'; then
    exit 0
fi

if ! select_commit_tool; then
    exit 0
fi

if ! invoke_commit_agent > "$agent_output" 2>&1; then
    automatic_commit_failure "failed to generate commit message"
fi

if ! parse_commit_message; then
    automatic_commit_failure "could not parse generated commit message"
fi

printf 'Proposed commit message:\n\n'
cat "$commit_message_file"
printf '\n'

if ! prompt_yes_no 'Use this commit message?'; then
    exit 0
fi

git commit -q -F "$commit_message_file" ||
    automatic_commit_failure "failed to create integration commit"
