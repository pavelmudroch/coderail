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

usage() {
    cat <<'EOF'
Usage:
  cr work start <work-name>

  Start new work with given name. Automatically creates new git branch named
  'coderail/<slugified-work-name> and switches to it. Nothing is automatically
  pushed to remote, all stays local, user must push manually.
  This command requires clean git working tree.

Options:
  -h, --help            Show this help message and exit

Arguments:
  <work-name>           The name of the planned work, will be slugified
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
            break
            ;;
    esac
done

[ "$#" -gt 0 ] || error "missing work name"

work_name=$1
shift
[ "$#" -eq 0 ] || error "unexpected argument: $1"

case "$work_name" in
    ''|*'
'*)
        error "work name must be non-empty and single-line"
        ;;
esac

work_slug=$(ticket_slugify_title "$work_name" 2>/dev/null) ||
    error "work name cannot be slugified: $work_name"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
    fatal "work start requires a Git repository"

[ -d .coderail ] ||
    fatal "coderail directory not found: .coderail; run cr init before proceeding"

base_branch=$(git branch --show-current) ||
    fatal "failed to determine current branch"
[ -n "$base_branch" ] ||
    fatal "work start requires a named current branch"

worktree_status=$(git status --porcelain --untracked-files=all) ||
    fatal "failed to query Git worktree"
[ -z "$worktree_status" ] ||
    fatal "worktree must be clean before starting work"

work_branch=coderail/$work_slug

if git show-ref --verify --quiet "refs/heads/$work_branch"; then
    fatal "work branch already exists: $work_branch"
fi

git switch --quiet -c "$work_branch" ||
    fatal "failed to create work branch: $work_branch"

find .coderail -type f \
    ! -path .coderail/conf.ini \
    ! -path .coderail/test.map \
    -delete || fatal "failed to remove inherited workflow files"

printf 'base_branch=%s\nwork_branch=%s\nwork_name=%s\n' \
    "$base_branch" "$work_branch" "$work_name" > .coderail/work.ini ||
    fatal "failed to write work record"
