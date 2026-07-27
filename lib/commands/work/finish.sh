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
. "$ROOT_DIR/lib/utils/loop.sh"
. "$ROOT_DIR/lib/utils/work.sh"

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
    if [ -n "${default_tool:-}" ]; then
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
            exec "$selected_tool" --sandbox workspace-write \
                -c 'sandbox_workspace_write.network_access=true' \
                exec "$commit_agent_prompt"
            ;;
        claude)
            exec "$selected_tool" --dangerously-skip-permissions -p \
                "$commit_agent_prompt"
            ;;
        gemini)
            exec "$selected_tool" --approval-mode=yolo -p "$commit_agent_prompt"
            ;;
        copilot)
            exec "$selected_tool" --yolo -p "$commit_agent_prompt"
            ;;
        *)
            automatic_commit_failure "unsupported tool: $selected_tool"
            ;;
    esac
}

show_commit_generation() {
    dot_count=0

    while :; do
        printf '\rGenerating commit%.*s\033[K' "$dot_count" '.....'
        sleep 1
        dot_count=$(((dot_count + 1) % 6))
    done
}

stop_commit_generation() {
    if [ -n "${commit_spinner_pid:-}" ]; then
        kill "$commit_spinner_pid" 2>/dev/null || :
        wait "$commit_spinner_pid" 2>/dev/null || :
        commit_spinner_pid=
        printf '\r\033[K'
    fi
}

stop_commit_agent() {
    if [ -n "${commit_agent_pid:-}" ]; then
        kill -INT "$commit_agent_pid" 2>/dev/null || :
        wait "$commit_agent_pid" 2>/dev/null || :
        commit_agent_pid=
    fi
}

abort() {
    stop_commit_generation
    stop_commit_agent
    exit "$1"
}

remove_commit_message() {
    if [ -e "$commit_message_file" ] || [ -L "$commit_message_file" ]; then
        rm -rf "$commit_message_file" ||
            return 1
    fi

    [ ! -e "$commit_message_file" ] && [ ! -L "$commit_message_file" ]
}

read_commit_message() {
    [ -f "$commit_message_file" ] &&
        [ ! -L "$commit_message_file" ] &&
        [ -r "$commit_message_file" ] ||
        return 1

    commit_message_size=$(wc -c < "$commit_message_file" | tr -d '[:space:]') ||
        return 1
    [ "$commit_message_size" -ge 1 ] &&
        [ "$commit_message_size" -le 65536 ] ||
        return 1

    if LC_ALL=C od -An -v -tx1 "$commit_message_file" |
        grep -Eq '(^| )(00|0d)( |$)'
    then
        return 1
    fi

    commit_message=$(cat "$commit_message_file"; printf .) || return 1
    commit_message=${commit_message%.}
    remove_commit_message || return 1

    printf '%s\n' "$commit_message" |
        LC_ALL=C awk '
            NR == 1 {
                exit $0 !~ /^(feat|fix|refactor|docs|test|style|chore)(\([^()\001-\037\177]+\))?!?: [^\001-\040\177][^\001-\037\177]*$/
            }
        '
}

collect_managed_paths() {
    managed_ref=$1

    git ls-tree -r --name-only "$managed_ref" -- .coderail |
        while IFS= read -r managed_path || [ -n "$managed_path" ]; do
            case "$managed_path" in
                .coderail/loop/.gitignore)
                    printf '%s\n' "$managed_path"
                    ;;
                .coderail/config.ini|.coderail/conf.ini|.coderail/test.map|*/.gitignore|*/.gitkeep)
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
        [ "$work_managed_path" = .coderail/loop/.gitignore ] &&
            continue
        rm -f "$work_managed_path" ||
            fatal "failed to remove work workflow file: $work_managed_path"
    done < "$work_managed_paths"
}

return_to_work_branch() {
    if [ "$loop_diagnostics_present" = true ] &&
        ! git cat-file -e HEAD:.coderail/loop/.gitignore 2>/dev/null
    then
        rm -f .coderail/loop/.gitignore ||
            return 1
    fi

    git switch --quiet "$recorded_work_branch" ||
        return 1

    if [ "$loop_diagnostics_present" = true ]; then
        loop_setup . >/dev/null &&
            loop_verify_ignore_policy .
    fi
}

setup_loop_ignore_bridge() {
    [ "$loop_diagnostics_present" = true ] ||
        return 0

    loop_base_ignore_file=$tmp_dir/base-loop-gitignore
    if git ls-tree "$recorded_base_branch" -- .coderail/loop/.gitignore |
        grep -q '^100[0-9][0-9][0-9] blob ' &&
        git show "$recorded_base_branch:.coderail/loop/.gitignore" \
            > "$loop_base_ignore_file" 2>/dev/null &&
        printf '*\n!.gitignore\n' | cmp "$loop_base_ignore_file" - >/dev/null 2>&1
    then
        return 0
    fi

    loop_bridge_file=$(git rev-parse --git-path info/exclude) ||
        return 1
    loop_bridge_backup=$tmp_dir/base-git-exclude
    loop_bridge_file_existed=false

    mkdir -p "$(dirname "$loop_bridge_file")" ||
        return 1

    if [ -e "$loop_bridge_file" ] || [ -L "$loop_bridge_file" ]; then
        [ -f "$loop_bridge_file" ] &&
            [ ! -L "$loop_bridge_file" ] ||
            return 1
        cp "$loop_bridge_file" "$loop_bridge_backup" ||
            return 1
        loop_bridge_file_existed=true
    else
        : > "$loop_bridge_backup" ||
            return 1
    fi

    printf '\n%s\n' '/.coderail/loop/' >> "$loop_bridge_file" ||
        return 1

    loop_bridge_active=true
}

remove_loop_ignore_bridge() {
    [ "$loop_bridge_active" = true ] ||
        return 0

    if [ "$loop_bridge_file_existed" = true ]; then
        cat "$loop_bridge_backup" > "$loop_bridge_file" ||
            return 1
    else
        rm -f "$loop_bridge_file" ||
            return 1
    fi

    loop_bridge_active=false
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

loop_diagnostics_present=false
if [ -e .coderail/loop ] || [ -L .coderail/loop ]; then
    loop_verify_ignore_policy . ||
        fatal "loop ignore policy is invalid: .coderail/loop/.gitignore"
    loop_diagnostics_present=true
fi

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
chmod 700 "$tmp_dir" ||
    fatal "failed to secure temporary directory"

loop_bridge_active=false
loop_bridge_backup=
loop_bridge_file=
loop_bridge_file_existed=false

cleanup() {
    cleanup_status=$?

    if ! remove_commit_message; then
        echo "error: failed to remove commit-message exchange artifact" >&2
        [ "$cleanup_status" -ne 0 ] ||
            cleanup_status=1
    fi

    if [ "$cleanup_status" -eq 0 ]; then
        if ! loop_remove .; then
            echo "error: failed to remove loop diagnostic directory" >&2
            cleanup_status=1
        fi
    elif [ "$loop_diagnostics_present" = true ]; then
        if ! loop_verify_ignore_policy .; then
            if ! return_to_work_branch; then
                echo "error: failed to preserve loop diagnostic ignore policy" >&2
            fi
        elif ! loop_setup . >/dev/null ||
            ! loop_verify_ignore_policy .
        then
            echo "error: failed to preserve loop diagnostic ignore policy" >&2
        fi
    fi

    if ! remove_loop_ignore_bridge; then
        echo "error: failed to remove loop diagnostic ignore bridge" >&2
        [ "$cleanup_status" -ne 0 ] ||
            cleanup_status=1
    fi

    rm -rf "$tmp_dir"
    trap - EXIT
    exit "$cleanup_status"
}
trap cleanup EXIT
trap 'abort 129' HUP
trap 'abort 130' INT
trap 'abort 143' TERM

ticket_files=$tmp_dir/ticket-files
work_managed_paths=$tmp_dir/work-managed-paths
base_managed_paths=$tmp_dir/base-managed-paths
committed_record=$tmp_dir/work.ini
squash_unmerged_paths=$tmp_dir/squash-unmerged-paths
agent_output=$tmp_dir/agent-output
commit_message_file=$tmp_dir/commit-message
commit_message=

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

setup_loop_ignore_bridge ||
    fatal "failed to set up loop diagnostic ignore bridge"

git switch --quiet "$recorded_base_branch" ||
    fatal "failed to switch to base branch: $recorded_base_branch"

if [ "$loop_diagnostics_present" = true ]; then
    loop_setup . >/dev/null ||
        fatal "failed to set up loop diagnostic directory on base branch"
    if ! loop_verify_ignore_policy .; then
        if return_to_work_branch; then
            fatal "loop ignore policy is invalid on base branch: .coderail/loop/.gitignore"
        else
            fatal "loop ignore policy is invalid on base branch: .coderail/loop/.gitignore; failed to return to work branch"
        fi
    fi
fi

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

git rm --quiet --force --ignore-unmatch --cached -- \
    .coderail/loop/.gitignore ||
    fatal "failed to remove loop diagnostic ignore from integration"

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

commit_agent_pid=
commit_spinner_pid=

[ ! -e "$commit_message_file" ] && [ ! -L "$commit_message_file" ] ||
    automatic_commit_failure "commit-message exchange artifact already exists"

case "$selected_tool" in
    codex)
        commit_skill_invocation='$cr-commit'
        ;;
    copilot|claude|gemini)
        commit_skill_invocation='/cr-commit'
        ;;
esac

commit_agent_prompt=$(printf '%s\n' \
    "$commit_skill_invocation" \
    '' \
    "Write only the raw commit message to this private exchange file: $commit_message_file" \
    'Do not write a summary, command, markdown, or other prose to that file.')

invoke_commit_agent > "$agent_output" 2>&1 &
commit_agent_pid=$!

if [ -t 1 ]; then
    show_commit_generation &
    commit_spinner_pid=$!
fi

if wait "$commit_agent_pid"; then
    commit_agent_pid=
    stop_commit_generation
else
    commit_agent_status=$?
    commit_agent_pid=
    stop_commit_generation
    remove_commit_message ||
        automatic_commit_failure "failed to remove commit-message exchange artifact"
    [ "$commit_agent_status" -eq 130 ] && exit 130
    automatic_commit_failure "failed to generate commit message"
fi

if ! read_commit_message; then
    remove_commit_message ||
        automatic_commit_failure "failed to remove commit-message exchange artifact"
    automatic_commit_failure "invalid commit-message exchange artifact"
fi

[ ! -e "$commit_message_file" ] && [ ! -L "$commit_message_file" ] ||
    automatic_commit_failure "commit-message exchange artifact changed"

printf 'Proposed commit message:\n\n'
printf '%s' "$commit_message"
printf '\n'

if ! prompt_yes_no 'Use this commit message?'; then
    exit 0
fi

printf '%s' "$commit_message" | git commit -q -F - ||
    automatic_commit_failure "failed to create integration commit"
