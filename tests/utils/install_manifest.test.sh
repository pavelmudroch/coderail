#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/path.sh"
. "$PROJECT_ROOT/lib/utils/fs.sh"
. "$PROJECT_ROOT/lib/utils/install_manifest.sh"

test_dir=$(mktemp -d)
temp_resource_file=$test_dir/temp-resources
: > "$temp_resource_file"

register_temp_resource()
{
    printf '%s\n' "$1" >> "$temp_resource_file"
}

_cleanup_temp_resources()
{
    while IFS= read -r temp_resource || [ -n "$temp_resource" ]; do
        rm -rf "$temp_resource"
    done < "$temp_resource_file"
    : > "$temp_resource_file"
}

_cleanup_test_resources()
{
    _cleanup_temp_resources
    rm -rf "$test_dir"
}

trap '_cleanup_test_resources' 0 HUP INT TERM

_expect_record()
{
    source_file=$1
    ownership_path=$2
    expected_checksum=$3
    expected_length=$4

    if ! install_manifest_record "$source_file" "$ownership_path" > "$test_dir/output"; then
        return 1
    fi
    printf '%s %s %s\n' "$expected_checksum" "$expected_length" "$ownership_path" \
        > "$test_dir/expected"
    cmp -s "$test_dir/expected" "$test_dir/output"
}

_expect_failure_without_stdout()
{
    if "$@" > "$test_dir/output" 2> "$test_dir/error"; then
        return 1
    fi

    [ ! -s "$test_dir/output" ]
}

_expect_publish_success()
{
    destination=$1
    snapshot_file=$2

    if ! install_manifest_publish "$destination" "$snapshot_file" > "$test_dir/output"; then
        return 1
    fi

    [ ! -s "$test_dir/output" ]
}

_expect_publish_failure_without_stdout()
{
    if install_manifest_publish "$@" > "$test_dir/output" 2> "$test_dir/error"; then
        return 1
    fi

    [ ! -s "$test_dir/output" ]
}

_file_not_empty()
{
    [ -s "$1" ]
}

_file_absent()
{
    [ ! -e "$1" ] && [ ! -L "$1" ]
}

_cleanup_registered_temp_resources()
{
    temp_resource=$test_dir/cleanup-resource
    mkdir "$temp_resource"
    register_temp_resource "$temp_resource"
    _cleanup_temp_resources
    _file_absent "$temp_resource" && [ ! -s "$temp_resource_file" ]
}

_publish_relative_destination()
(
    cd "$test_dir"
    _expect_publish_success 'relative/manifest' "$test_dir/snapshot-create"
)

_publish_leading_hyphen_destination()
(
    cd "$test_dir"
    _expect_publish_success '-manifest' "$test_dir/snapshot-create"
)

_publish_preserves_caller_state()
{
    destination=destination-before
    snapshot_file=snapshot-before
    record=record-before
    checksum=checksum-before
    byte_length=length-before
    ownership_path=ownership-before
    seen_paths=seen-before
    temp_resource=temp-before
    caller_directory=$(pwd)
    trap ':' HUP INT TERM
    caller_traps=$(trap)

    install_manifest_publish "$test_dir/state/manifest" "$test_dir/snapshot-create" \
        > "$test_dir/output" || return 1

    [ "$destination" = destination-before ] &&
        [ "$snapshot_file" = snapshot-before ] &&
        [ "$record" = record-before ] &&
        [ "$checksum" = checksum-before ] &&
        [ "$byte_length" = length-before ] &&
        [ "$ownership_path" = ownership-before ] &&
        [ "$seen_paths" = seen-before ] &&
        [ "$temp_resource" = temp-before ] &&
        [ "$(pwd)" = "$caller_directory" ] &&
        [ "$(trap)" = "$caller_traps" ] &&
        [ ! -s "$test_dir/output" ]
}

_publish_invalid_snapshot_does_not_write()
(
    fs_write()
    {
        : > "$test_dir/fs-write-called"
        return 1
    }

    _expect_publish_failure_without_stdout "$test_dir/missing/manifest" \
        "$test_dir/invalid-snapshot"
)

_publish_reader_failure()
(
    cat()
    {
        return 1
    }

    _expect_publish_failure_without_stdout "$test_dir/reader/manifest" \
        "$test_dir/snapshot-create"
)

_publish_staging_failure()
(
    _fs_temp_dir_at()
    {
        return 1
    }

    _expect_publish_failure_without_stdout "$test_dir/staging/manifest" \
        "$test_dir/snapshot-create"
)

_publish_replace_failure()
(
    fs_replace()
    {
        return 1
    }

    _expect_publish_failure_without_stdout "$test_dir/preserved-manifest" \
        "$test_dir/snapshot-create"
)

_record_with_tab_path()
{
    install_manifest_record "$test_dir/known" "safe$(printf '\t')path"
}

_record_with_newline_path()
{
    ownership_path='safe
path'
    install_manifest_record "$test_dir/known" "$ownership_path"
}

_checksum_failure_has_no_stdout()
{
    path_checksum()
    {
        return 1
    }

    _expect_failure_without_stdout install_manifest_record "$test_dir/known" "safe/path"
}

_record_preserves_caller_state()
{
    source_file=source-before
    ownership_path=ownership-before
    ownership_path_tab=tab-before
    ownership_path_newline=newline-before
    checksum_record=record-before
    file=file-before
    checksum_result=result-before
    checksum=checksum-before
    byte_length=length-before
    caller_directory=$(pwd)
    trap ':' HUP INT TERM
    caller_traps=$(trap)

    install_manifest_record "$test_dir/known" "safe/path" > "$test_dir/output" || return 1

    [ "$source_file" = source-before ] &&
        [ "$ownership_path" = ownership-before ] &&
        [ "$ownership_path_tab" = tab-before ] &&
        [ "$ownership_path_newline" = newline-before ] &&
        [ "$checksum_record" = record-before ] &&
        [ "$file" = file-before ] &&
        [ "$checksum_result" = result-before ] &&
        [ "$checksum" = checksum-before ] &&
        [ "$byte_length" = length-before ] &&
        [ "$(pwd)" = "$caller_directory" ] &&
        [ "$(trap)" = "$caller_traps" ]
}

print_tests_header "Install Manifest Utils Tests"

printf 'abc' > "$test_dir/known"
: > "$test_dir/empty"
special_source=$test_dir'/ - source \;$(keep)&[safe] '
printf 'special' > "$special_source"
mkdir "$test_dir/directory"
mkfifo "$test_dir/fifo"
ln -s "$test_dir/known" "$test_dir/link"

test "record: generates a known content record" _expect_record \
    "$test_dir/known" "generic/owned-file" 1219131554 3
test "record: generates an empty file record" _expect_record \
    "$test_dir/empty" "outside/existing/layouts" 4294967295 0
test "record: preserves a leading hyphen ownership path" _expect_record \
    "$test_dir/known" "-owned/path" 1219131554 3
test "record: preserves literal ownership path characters" _expect_record \
    "$special_source" \
    " - leading and trailing \\ path;\$(keep)&[safe] " 371826364 7
test "record: leaves caller state unchanged" _record_preserves_caller_state

test "record: rejects no arguments" _expect_failure_without_stdout install_manifest_record
test "record: rejects one argument" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/known"
test "record: rejects too many arguments" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/known" "safe/path" extra
test "record: rejects a missing source" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/missing" "safe/path"

chmod 000 "$test_dir/known"
test "record: rejects an unreadable source" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/known" "safe/path"
chmod 600 "$test_dir/known"

test "record: rejects a directory source" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/directory" "safe/path"
test "record: rejects a fifo source" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/fifo" "safe/path"
test "record: rejects a symlink source" _expect_failure_without_stdout \
    install_manifest_record "$test_dir/link" "safe/path"

for unsafe_path in '' '/absolute' '.' '..' './path' '../path' 'path/' 'path//part' \
    'path/.' 'path/..' 'path/./part' 'path/../part'; do
    test "record: rejects unsafe ownership path: $unsafe_path" \
        _expect_failure_without_stdout install_manifest_record "$test_dir/known" "$unsafe_path"
done
test "record: rejects a tab in the ownership path" \
    _expect_failure_without_stdout _record_with_tab_path
test "record: rejects a newline in the ownership path" \
    _expect_failure_without_stdout _record_with_newline_path
test "record: emits no stdout after checksum failure" _checksum_failure_has_no_stdout

printf '%s\n' \
    '0 0 payload' \
    '001 02  leading and trailing \\ path;$(keep)&[safe] ' \
    '4294967295 0 missing/payload' > "$test_dir/snapshot-create"
printf '1 2 final/record-without-newline' > "$test_dir/snapshot-unterminated"
: > "$test_dir/snapshot-empty"
printf 'current payload' > "$test_dir/payload"
cp "$test_dir/payload" "$test_dir/payload-expected"

test "publish: creates a missing manifest with exact snapshot bytes" \
    _expect_publish_success "$test_dir/absolute/missing/manifest" "$test_dir/snapshot-create"
test "publish: preserves created manifest bytes and snapshot" sh -c \
    'cmp -s "$1" "$2" && cmp -s "$1" "$3"' sh "$test_dir/snapshot-create" \
    "$test_dir/absolute/missing/manifest" "$test_dir/snapshot-create"
test "publish: leaves payload files unchanged" cmp -s "$test_dir/payload-expected" "$test_dir/payload"
test "publish: accepts a relative destination" _publish_relative_destination
test "publish: preserves a relative manifest" cmp -s "$test_dir/snapshot-create" \
    "$test_dir/relative/manifest"
test "publish: protects a leading-hyphen relative destination" \
    _publish_leading_hyphen_destination
test "publish: preserves a leading-hyphen manifest" cmp -s "$test_dir/snapshot-create" \
    "$test_dir/-manifest"

mkdir "$test_dir/replacement"
printf '%s\n' '9 9 retained/entry' > "$test_dir/replacement/manifest"
test "publish: replaces prior records and removes omitted entries" \
    _expect_publish_success "$test_dir/replacement/manifest" "$test_dir/snapshot-unterminated"
test "publish: preserves an unterminated final record" cmp -s \
    "$test_dir/snapshot-unterminated" "$test_dir/replacement/manifest"
test "publish: replaces a manifest with an empty snapshot" \
    _expect_publish_success "$test_dir/replacement/manifest" "$test_dir/snapshot-empty"
test "publish: preserves an empty snapshot" cmp -s "$test_dir/snapshot-empty" \
    "$test_dir/replacement/manifest"
test "publish: leaves caller state unchanged" _publish_preserves_caller_state
test "publish: registers staging resources for caller cleanup" _file_not_empty \
    "$temp_resource_file"
test "publish: caller cleanup removes registered staging resources" \
    _cleanup_registered_temp_resources

printf '%s\n' 'invalid' > "$test_dir/invalid-snapshot"
printf '%s\n' '7 8 original/record' > "$test_dir/preserved-manifest"
cp "$test_dir/preserved-manifest" "$test_dir/preserved-manifest-expected"
mkdir "$test_dir/snapshot-directory" "$test_dir/destination-directory"
mkfifo "$test_dir/snapshot-fifo" "$test_dir/destination-fifo"
ln -s "$test_dir/snapshot-create" "$test_dir/snapshot-link"
ln -s missing "$test_dir/destination-link"
ln -s missing "$test_dir/destination-dangling-link"

test "publish: rejects no arguments" _expect_publish_failure_without_stdout
test "publish: rejects one argument" _expect_publish_failure_without_stdout "$test_dir/manifest"
test "publish: rejects too many arguments" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/snapshot-create" extra
test "publish: rejects a missing snapshot" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/missing-snapshot"

chmod 000 "$test_dir/snapshot-create"
test "publish: rejects an unreadable snapshot" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/snapshot-create"
chmod 600 "$test_dir/snapshot-create"

test "publish: rejects a snapshot directory" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/snapshot-directory"
test "publish: rejects a snapshot fifo" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/snapshot-fifo"
test "publish: rejects a snapshot symlink" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/snapshot-link"
test "publish: rejects an empty destination" _expect_publish_failure_without_stdout \
    '' "$test_dir/snapshot-create"
test "publish: rejects a destination ending in a slash" _expect_publish_failure_without_stdout \
    "$test_dir/manifest/" "$test_dir/snapshot-create"
destination_with_newline='manifest
next'
test "publish: rejects a destination containing a newline" _expect_publish_failure_without_stdout \
    "$destination_with_newline" "$test_dir/snapshot-create"

for malformed_record in '' '1' '1 2' ' 2 path' 'a 2 path' '1 a path' \
    '1  2 path' '1 2\tpath' '1\t2 path' 'checksum\tlength\tpath'; do
    printf '%b\n' "$malformed_record" > "$test_dir/invalid-snapshot"
    test "publish: rejects malformed record: $malformed_record" \
        _expect_publish_failure_without_stdout "$test_dir/manifest" "$test_dir/invalid-snapshot"
done

for unsafe_path in '' '/absolute' '.' '..' './path' '../path' 'path/' 'path//part' \
    'path/.' 'path/..' 'path/./part' 'path/../part'; do
    printf '1 2 %s\n' "$unsafe_path" > "$test_dir/invalid-snapshot"
    test "publish: rejects unsafe snapshot path: $unsafe_path" \
        _expect_publish_failure_without_stdout "$test_dir/manifest" "$test_dir/invalid-snapshot"
done
printf '1 2 tab\tpath\n' > "$test_dir/invalid-snapshot"
test "publish: rejects a tab in a snapshot path" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/invalid-snapshot"
printf '%s\n%s\n' '1 2 duplicate/path' '3 4 duplicate/path' > "$test_dir/invalid-snapshot"
test "publish: rejects literal duplicate snapshot paths" _expect_publish_failure_without_stdout \
    "$test_dir/manifest" "$test_dir/invalid-snapshot"

printf '%s\n' 'invalid' > "$test_dir/invalid-snapshot"
test "publish: preserves an existing manifest after validation failure" \
    _expect_publish_failure_without_stdout "$test_dir/preserved-manifest" \
    "$test_dir/invalid-snapshot"

test "publish: rejects a destination directory" _expect_publish_failure_without_stdout \
    "$test_dir/destination-directory" "$test_dir/snapshot-create"
test "publish: rejects a destination fifo" _expect_publish_failure_without_stdout \
    "$test_dir/destination-fifo" "$test_dir/snapshot-create"
test "publish: rejects a destination symlink" _expect_publish_failure_without_stdout \
    "$test_dir/destination-link" "$test_dir/snapshot-create"
test "publish: rejects a dangling destination symlink" _expect_publish_failure_without_stdout \
    "$test_dir/destination-dangling-link" "$test_dir/snapshot-create"
test "publish: leaves an existing manifest after validation failure" cmp -s \
    "$test_dir/preserved-manifest-expected" "$test_dir/preserved-manifest"
test "publish: validates before filesystem mutation" _publish_invalid_snapshot_does_not_write
test "publish: invalid input creates no missing parents" _file_absent "$test_dir/missing"
test "publish: source-read failure leaves no manifest" _publish_reader_failure
test "publish: source-read failure creates no manifest" _file_absent "$test_dir/reader/manifest"
test "publish: staging failure leaves no manifest" _publish_staging_failure
test "publish: staging failure creates no manifest" _file_absent "$test_dir/staging/manifest"
test "publish: replacement failure leaves an existing manifest" _publish_replace_failure
test "publish: replacement failure preserves the manifest" cmp -s \
    "$test_dir/preserved-manifest-expected" "$test_dir/preserved-manifest"

print_tests_summary

if some_tests_failed; then
    exit 1
fi
