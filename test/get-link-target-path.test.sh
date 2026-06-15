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
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/coderail-get-link-target-path.XXXXXX")

cleanup() {
    cd "$ORIGINAL_DIR"
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

. "$SCRIPT_DIR/suite.sh"
. "$ROOT_DIR/lib/utils/get-link-target-path.sh"

get_link_target_path_test() {
    get_link_target_path "$TEST_PATH"
}

run_get_link_target_path_test() {
    message=$1
    path=$2
    expected=$3

    TEST_PATH=$path
    run_test "$message" "$expected" get_link_target_path_test
}

mkdir -p "$TMP_DIR/work/alpha/bravo/charlie" "$TMP_DIR/work/links"
touch "$TMP_DIR/work/alpha/bravo/file.txt"
touch "$TMP_DIR/work/alpha/bravo/charlie/nested.txt"

absolute_tmp_dir=$(
    CDPATH= cd -- "$TMP_DIR"
    pwd
)
absolute_work_dir="$absolute_tmp_dir/work"
absolute_alpha_dir="$absolute_work_dir/alpha"
absolute_bravo_dir="$absolute_alpha_dir/bravo"
absolute_charlie_dir="$absolute_bravo_dir/charlie"
absolute_links_dir="$absolute_work_dir/links"
absolute_file="$absolute_bravo_dir/file.txt"
absolute_nested_file="$absolute_charlie_dir/nested.txt"

ln -s "$absolute_file" "$absolute_links_dir/absolute-file"
ln -s "$absolute_nested_file" "$absolute_links_dir/absolute-nested-file"
ln -s "../alpha/bravo/file.txt" "$absolute_links_dir/relative-file"
ln -s "../alpha/bravo/charlie/nested.txt" "$absolute_links_dir/relative-nested-file"
ln -s "../alpha/bravo/charlie/../file.txt" "$absolute_links_dir/relative-file-with-parent-references"
ln -s "$absolute_links_dir/relative-file" "$absolute_links_dir/absolute-link-chain"
ln -s "relative-file" "$absolute_links_dir/relative-link-chain"
ln -s "../alpha/bravo/charlie/missing.txt" "$absolute_links_dir/missing-file"
ln -s "../alpha/bravo/charlie" "$absolute_links_dir/relative-dir"

run_get_link_target_path_test "absolute non-link file" "$absolute_file" "$absolute_file"
run_get_link_target_path_test "absolute non-link directory" "$absolute_bravo_dir" "$absolute_bravo_dir"
run_get_link_target_path_test "relative non-link path" "work/alpha/bravo/file.txt" "work/alpha/bravo/file.txt"
run_get_link_target_path_test "absolute link to file" "$absolute_links_dir/absolute-file" "$absolute_file"
run_get_link_target_path_test "absolute link to nested file" "$absolute_links_dir/absolute-nested-file" "$absolute_nested_file"
run_get_link_target_path_test "relative link to file" "$absolute_links_dir/relative-file" "$absolute_links_dir/../alpha/bravo/file.txt"
run_get_link_target_path_test "relative link to nested file" "$absolute_links_dir/relative-nested-file" "$absolute_links_dir/../alpha/bravo/charlie/nested.txt"
run_get_link_target_path_test "relative link with parent references" "$absolute_links_dir/relative-file-with-parent-references" "$absolute_links_dir/../alpha/bravo/charlie/../file.txt"
run_get_link_target_path_test "absolute link chain" "$absolute_links_dir/absolute-link-chain" "$absolute_links_dir/../alpha/bravo/file.txt"
run_get_link_target_path_test "relative link chain" "$absolute_links_dir/relative-link-chain" "$absolute_links_dir/../alpha/bravo/file.txt"
run_get_link_target_path_test "relative broken link" "$absolute_links_dir/missing-file" "$absolute_links_dir/../alpha/bravo/charlie/missing.txt"
run_get_link_target_path_test "relative directory link" "$absolute_links_dir/relative-dir" "$absolute_links_dir/../alpha/bravo/charlie"

cd "$absolute_links_dir"
run_get_link_target_path_test "relative input link" "relative-file" "./../alpha/bravo/file.txt"
run_get_link_target_path_test "relative input link chain" "relative-link-chain" "./../alpha/bravo/file.txt"

cd "$SCRIPT_DIR"
run_get_link_target_path_test "relative to script directory non-link" "../lib/utils/get-link-target-path.sh" "../lib/utils/get-link-target-path.sh"
