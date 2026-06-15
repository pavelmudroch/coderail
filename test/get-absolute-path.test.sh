#!/usr/bin/env sh

set -eu

ORIGINAL_DIR=$(pwd)
SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)
ROOT_DIR=$(
    CDPATH= cd -- "$SCRIPT_DIR/.."
    pwd
)
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/coderail-get-absolute-path.XXXXXX")

cleanup() {
    cd "$ORIGINAL_DIR"
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

. "$SCRIPT_DIR/suite.sh"
. "$ROOT_DIR/lib/utils/get-absolute-path.sh"

get_absolute_path_test() {
    get_absolute_path "$TEST_PATH"
}

run_get_absolute_path_test() {
    message=$1
    path=$2
    expected=$3

    TEST_PATH=$path
    run_test "$message" "$expected" get_absolute_path_test
}

run_get_absolute_path_failing_test() {
    message=$1
    path=$2

    TEST_PATH=$path
    run_failing_test "$message" 1 get_absolute_path_test
}

mkdir -p "$TMP_DIR/work/alpha/bravo/charlie"
touch "$TMP_DIR/work/alpha/bravo/file.txt"

absolute_tmp_dir=$(
    CDPATH= cd -- "$TMP_DIR"
    pwd
)
absolute_work_dir="$absolute_tmp_dir/work"
absolute_alpha_dir="$absolute_work_dir/alpha"
absolute_bravo_dir="$absolute_alpha_dir/bravo"
absolute_file="$absolute_bravo_dir/file.txt"

run_get_absolute_path_test "absolute existing file" "$absolute_file" "$absolute_file"
run_get_absolute_path_test "absolute existing directory" "$absolute_bravo_dir" "$absolute_bravo_dir"
run_get_absolute_path_test "absolute existing file with parent references" "$absolute_alpha_dir/../alpha/bravo/../bravo/file.txt" "$absolute_file"
run_get_absolute_path_test "absolute existing directory with parent references" "$absolute_work_dir/alpha/../alpha/bravo" "$absolute_bravo_dir"
run_get_absolute_path_test "absolute non-existing file with existing parent" "$absolute_bravo_dir/new-file.txt" "$absolute_bravo_dir/new-file.txt"
run_get_absolute_path_test "absolute non-existing file with parent references" "$absolute_work_dir/alpha/../alpha/bravo/missing.txt" "$absolute_bravo_dir/missing.txt"
run_get_absolute_path_failing_test "absolute non-existing file with missing parent" "$absolute_work_dir/missing-parent/file.txt"

cd "$absolute_alpha_dir"
run_get_absolute_path_test "relative existing file" "bravo/file.txt" "$absolute_file"
run_get_absolute_path_test "relative existing file with parent references" "bravo/../bravo/file.txt" "$absolute_file"
run_get_absolute_path_test "relative non-existing file with parent references" "../alpha/bravo/new-file.txt" "$absolute_bravo_dir/new-file.txt"
run_get_absolute_path_failing_test "relative non-existing file with missing parent" "../missing-parent/file.txt"

cd "$SCRIPT_DIR"
run_get_absolute_path_test "relative to script directory" "../lib/utils/get-absolute-path.sh" "$ROOT_DIR/lib/utils/get-absolute-path.sh"
