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
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/coderail-install-test.XXXXXX")
SYSTEM_PATH=/usr/bin:/bin:/usr/sbin:/sbin

cleanup() {
    cd "$ORIGINAL_DIR"
    rm -rf "$TMP_DIR"
}
trap cleanup EXIT HUP INT TERM

. "$SCRIPT_DIR/suite.sh"
. "$ROOT_DIR/lib/utils/get-absolute-path.sh"

create_case() {
    case_name=$1

    CASE_DIR="$TMP_DIR/$case_name"
    CASE_HOME="$CASE_DIR/home"
    CASE_BIN="$CASE_DIR/bin"
    CASE_TMP="$CASE_DIR/tmp"
    CASE_CODERAIL_HOME="$CASE_HOME/.coderail"
    CASE_LOG="$CASE_DIR/install.log"
    CASE_PATH="$CASE_BIN:$SYSTEM_PATH"

    mkdir -p "$CASE_HOME" "$CASE_BIN" "$CASE_TMP"
}

create_source_copy() {
    CASE_SOURCE="$CASE_DIR/source"
    mkdir -p "$CASE_SOURCE"
    cp "$ROOT_DIR/INSTALL" "$CASE_SOURCE/"
    cp -R "$ROOT_DIR/instructions" "$CASE_SOURCE/"
    cp -R "$ROOT_DIR/bin" "$CASE_SOURCE/"
    cp -R "$ROOT_DIR/lib" "$CASE_SOURCE/"
    CASE_INSTALL_SCRIPT="$CASE_SOURCE/lib/install.sh"
}

run_install() {
    HOME="$CASE_HOME" \
    CODERAIL_HOME="$CASE_CODERAIL_HOME" \
    CODERAIL_BIN_DIR="$CASE_BIN" \
    TMPDIR="$CASE_TMP" \
    PATH="$CASE_PATH" \
    sh "$CASE_INSTALL_SCRIPT" >"$CASE_LOG" 2>&1 </dev/null
}

run_install_without_bin_dir() {
    HOME="$CASE_HOME" \
    CODERAIL_HOME="$CASE_CODERAIL_HOME" \
    TMPDIR="$CASE_TMP" \
    PATH="$CASE_PATH" \
    sh "$CASE_INSTALL_SCRIPT" >"$CASE_LOG" 2>&1 </dev/null
}

capture_install_status() {
    if run_install; then
        INSTALL_STATUS=0
    else
        INSTALL_STATUS=$?
    fi
}

capture_install_without_bin_dir_status() {
    if run_install_without_bin_dir; then
        INSTALL_STATUS=0
    else
        INSTALL_STATUS=$?
    fi
}

exists_or_link() {
    if [ -e "$1" ] || [ -L "$1" ]; then
        printf yes
    else
        printf no
    fi
}

file_exists() {
    if [ -f "$1" ]; then
        printf yes
    else
        printf no
    fi
}

dir_exists() {
    if [ -d "$1" ]; then
        printf yes
    else
        printf no
    fi
}

link_exists() {
    if [ -L "$1" ]; then
        printf yes
    else
        printf no
    fi
}

link_target_matches() {
    link=$1
    expected=$2

    [ -L "$link" ] || { printf no; return; }

    actual_target=$(readlink "$link")
    actual_target=$(get_absolute_path "$actual_target")
    expected_target=$(get_absolute_path "$expected")

    if [ "$actual_target" = "$expected_target" ]; then
        printf yes
    else
        printf no
    fi
}

tmp_entry_count() {
    set -- $(find "$CASE_TMP" -mindepth 1 -maxdepth 1 -print | wc -l)
    printf '%s' "$1"
}

log_contains() {
    message=$1

    if grep -F "$message" "$CASE_LOG" >/dev/null 2>&1; then
        printf yes
    else
        printf no
    fi
}

print_install_summary() {
    printf 'status=%s marker=%s instructions=%s bin=%s lib=%s install=%s link=%s target=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME/.coderail-install")" \
        "$(dir_exists "$CASE_CODERAIL_HOME/instructions")" \
        "$(dir_exists "$CASE_CODERAIL_HOME/bin")" \
        "$(dir_exists "$CASE_CODERAIL_HOME/lib")" \
        "$(file_exists "$CASE_CODERAIL_HOME/INSTALL")" \
        "$(link_exists "$CASE_BIN/cr")" \
        "$(link_target_matches "$CASE_BIN/cr" "$CASE_CODERAIL_HOME/bin/cr")" \
        "$(tmp_entry_count)"
}

create_existing_valid_install() {
    mkdir -p "$CASE_CODERAIL_HOME/bin"
    touch "$CASE_CODERAIL_HOME/.coderail-install"
    printf 'old install\n' > "$CASE_CODERAIL_HOME/old-file"
    printf '#!/usr/bin/env sh\n' > "$CASE_CODERAIL_HOME/bin/cr"
    chmod +x "$CASE_CODERAIL_HOME/bin/cr"
    ln -s "$CASE_CODERAIL_HOME/bin/cr" "$CASE_BIN/cr"
}

clean_install_test() {
    create_case clean-install
    create_source_copy
    capture_install_status

    print_install_summary
}

reinstall_test() {
    create_case reinstall
    create_source_copy
    capture_install_status
    printf 'old install\n' > "$CASE_CODERAIL_HOME/old-file"
    capture_install_status

    printf 'status=%s marker=%s old_file=%s install=%s link=%s target=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME/.coderail-install")" \
        "$(file_exists "$CASE_CODERAIL_HOME/old-file")" \
        "$(file_exists "$CASE_CODERAIL_HOME/INSTALL")" \
        "$(link_exists "$CASE_BIN/cr")" \
        "$(link_target_matches "$CASE_BIN/cr" "$CASE_CODERAIL_HOME/bin/cr")" \
        "$(tmp_entry_count)"
}

prompt_decline_test() {
    create_case prompt-decline
    create_source_copy
    CASE_PATH="$SYSTEM_PATH"
    capture_install_without_bin_dir_status

    printf 'status=%s marker=%s link=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME/.coderail-install")" \
        "$(exists_or_link "$CASE_BIN/cr")" \
        "$(log_contains "set CODERAIL_BIN_DIR or add")" \
        "$(tmp_entry_count)"
}

unrelated_cr_in_path_test() {
    create_case unrelated-cr-in-path
    create_source_copy
    mkdir -p "$CASE_DIR/other"
    printf '#!/usr/bin/env sh\n' > "$CASE_DIR/other/cr"
    chmod +x "$CASE_DIR/other/cr"
    CASE_PATH="$CASE_DIR/other:$SYSTEM_PATH"
    capture_install_status

    printf 'status=%s marker=%s link=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME/.coderail-install")" \
        "$(exists_or_link "$CASE_BIN/cr")" \
        "$(log_contains "differs from install target")" \
        "$(tmp_entry_count)"
}

multiple_cr_in_path_test() {
    create_case multiple-cr-in-path
    create_source_copy
    mkdir -p "$CASE_DIR/other"
    printf '#!/usr/bin/env sh\n' > "$CASE_BIN/cr"
    printf '#!/usr/bin/env sh\n' > "$CASE_DIR/other/cr"
    chmod +x "$CASE_BIN/cr" "$CASE_DIR/other/cr"
    CASE_PATH="$CASE_BIN:$CASE_DIR/other:$SYSTEM_PATH"
    capture_install_status

    printf 'status=%s target_cr=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_BIN/cr")" \
        "$(log_contains "Multiple 'cr' commands found in PATH")" \
        "$(tmp_entry_count)"
}

invalid_target_cr_test() {
    create_case invalid-target-cr
    create_source_copy
    printf '#!/usr/bin/env sh\n' > "$CASE_BIN/cr"
    chmod +x "$CASE_BIN/cr"
    capture_install_status

    printf 'status=%s target_cr=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_BIN/cr")" \
        "$(log_contains "is not a valid CodeRail link")" \
        "$(tmp_entry_count)"
}

target_cr_exists_outside_path_test() {
    create_case target-cr-exists-outside-path
    create_source_copy
    printf '#!/usr/bin/env sh\n' > "$CASE_BIN/cr"
    chmod +x "$CASE_BIN/cr"
    CASE_PATH="$SYSTEM_PATH"
    capture_install_status

    printf 'status=%s target_cr=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_BIN/cr")" \
        "$(log_contains "A file or link already exists there")" \
        "$(tmp_entry_count)"
}

invalid_install_home_test() {
    create_case invalid-install-home
    create_source_copy
    mkdir -p "$CASE_CODERAIL_HOME"
    printf 'user data\n' > "$CASE_CODERAIL_HOME/user-file"
    capture_install_status

    printf 'status=%s user_file=%s link=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME/user-file")" \
        "$(exists_or_link "$CASE_BIN/cr")" \
        "$(log_contains "It is not empty or not a valid CodeRail home directory")" \
        "$(tmp_entry_count)"
}

install_home_is_file_test() {
    create_case install-home-is-file
    create_source_copy
    printf 'not a directory\n' > "$CASE_CODERAIL_HOME"
    capture_install_status

    printf 'status=%s home_file=%s link=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME")" \
        "$(exists_or_link "$CASE_BIN/cr")" \
        "$(log_contains "It is not empty or not a valid CodeRail home directory")" \
        "$(tmp_entry_count)"
}

bin_dir_is_file_test() {
    create_case bin-dir-is-file
    create_source_copy
    rm -rf "$CASE_BIN"
    printf 'not a directory\n' > "$CASE_BIN"
    capture_install_status

    printf 'status=%s home=%s bin_file=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(exists_or_link "$CASE_CODERAIL_HOME")" \
        "$(file_exists "$CASE_BIN")" \
        "$(log_contains "Failed to create")" \
        "$(tmp_entry_count)"
}

missing_source_instructions_rollback_test() {
    create_case missing-source-instructions
    create_source_copy
    create_existing_valid_install
    rm -rf "$CASE_SOURCE/instructions"
    capture_install_status

    printf 'status=%s old_file=%s link=%s target=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(file_exists "$CASE_CODERAIL_HOME/old-file")" \
        "$(link_exists "$CASE_BIN/cr")" \
        "$(link_target_matches "$CASE_BIN/cr" "$CASE_CODERAIL_HOME/bin/cr")" \
        "$(log_contains "Failed to install into")" \
        "$(tmp_entry_count)"
}

missing_installed_cr_rollback_test() {
    create_case missing-installed-cr
    create_source_copy
    rm -f "$CASE_SOURCE/bin/cr"
    capture_install_status

    printf 'status=%s home=%s link=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(exists_or_link "$CASE_CODERAIL_HOME")" \
        "$(exists_or_link "$CASE_BIN/cr")" \
        "$(log_contains "Failed to install 'cr' command.")" \
        "$(tmp_entry_count)"
}

broken_target_link_rollback_test() {
    create_case broken-target-link
    create_source_copy
    ln -s "$CASE_CODERAIL_HOME/bin/cr" "$CASE_BIN/cr"
    capture_install_status

    printf 'status=%s home=%s broken_link=%s message=%s tmp=%s' \
        "$INSTALL_STATUS" \
        "$(exists_or_link "$CASE_CODERAIL_HOME")" \
        "$(link_exists "$CASE_BIN/cr")" \
        "$(log_contains "Failed to install 'cr' command.")" \
        "$(tmp_entry_count)"
}

run_test "clean install" "status=0 marker=yes instructions=yes bin=yes lib=yes install=yes link=yes target=yes tmp=0" clean_install_test
run_test "reinstall overrides previous install" "status=0 marker=yes old_file=no install=yes link=yes target=yes tmp=0" reinstall_test
run_test "fail when user bin prompt is declined" "status=1 marker=no link=no message=yes tmp=0" prompt_decline_test
run_test "fail when unrelated cr is in PATH" "status=1 marker=no link=no message=yes tmp=0" unrelated_cr_in_path_test
run_test "fail when multiple cr commands are in PATH" "status=1 target_cr=yes message=yes tmp=0" multiple_cr_in_path_test
run_test "fail when target cr is not a valid CodeRail link" "status=1 target_cr=yes message=yes tmp=0" invalid_target_cr_test
run_test "fail when target cr exists outside PATH" "status=1 target_cr=yes message=yes tmp=0" target_cr_exists_outside_path_test
run_test "fail when install home has unmanaged contents" "status=1 user_file=yes link=no message=yes tmp=0" invalid_install_home_test
run_test "fail when install home is a file" "status=1 home_file=yes link=no message=yes tmp=0" install_home_is_file_test
run_test "rollback when bin dir path is a file" "status=1 home=no bin_file=yes message=yes tmp=0" bin_dir_is_file_test
run_test "rollback existing install when source instructions are missing" "status=1 old_file=yes link=yes target=yes message=yes tmp=0" missing_source_instructions_rollback_test
run_test "rollback fresh install when installed cr is missing" "status=1 home=no link=no message=yes tmp=0" missing_installed_cr_rollback_test
run_test "rollback fresh install when target has broken cr link" "status=1 home=no broken_link=yes message=yes tmp=0" broken_target_link_rollback_test

test_exit
