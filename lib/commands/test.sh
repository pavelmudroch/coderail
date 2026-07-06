#!/usr/bin/env sh

set -eu

usage() {
    cat <<'EOF'
Usage:
  cr test [options] [<file> ...]

  Run configured test commands for specified or changed files. At least one
  selector --changed or <file> -- must be provided.

Options:
  -h, --help            Show this help message and exit
  --changed             Run tests for all changed files, git must be available
                        in the current working directory

Arguments:
  <file>                Path to a file to run the tests for
EOF
}

error() {
    echo "error: $*" >&2
    echo >&2
    usage >&2
    exit 2
}

add_test_file() {
    if [ -n "$test_files" ]; then
        test_files="${test_files}
$1"
    else
        test_files=$1
    fi

    test_file_count=$((test_file_count + 1))
}

test_changed=false
test_files=
test_file_count=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        -h|--help)
            shift
            [ "$#" -eq 0 ] || error "unexpected argument: $1"
            usage
            exit 0
            ;;
        --changed)
            test_changed=true
            shift
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
            add_test_file "$1"
            shift
            ;;
    esac
done

while [ "$#" -gt 0 ]; do
    add_test_file "$1"
    shift
done

[ "$test_changed" = true ] || [ "$test_file_count" -gt 0 ] || error "missing selector: provide --changed or <file>"
