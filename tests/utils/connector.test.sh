#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/connector.sh"

test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' 0 HUP INT TERM

_create_connector()
{
    connector_dir="$1"
    contract_version="$2"

    mkdir -p "$connector_dir"
    printf 'contract_version = %s\n' "$contract_version" > "$connector_dir/connector.conf"
    for connector_script in \
        install_global_instruction.sh \
        install_skill.sh \
        install_sub_agent.sh \
        prompt_and_wait.sh; do
        printf '%s\n' '#!/usr/bin/env sh' > "$connector_dir/$connector_script"
        chmod +x "$connector_dir/$connector_script"
    done
}

_expect_silent_failure()
{
    if output=$("$@" 2>&1); then
        return 1
    fi

    [ -z "$output" ]
}

print_tests_header "Connector Utils Tests"

_create_connector "$test_dir/compatible" "1.0.0"
_create_connector "$test_dir/newer-compatible" "1.4.2"
_create_connector "$test_dir/older" "0.9.9"
_create_connector "$test_dir/new-major" "2.0.0"
_create_connector "$test_dir/malformed-version" "1.0"

test "accepts the minimum compatible contract version" \
    _connector_is_possible_connector_dir "$test_dir/compatible"
test "accepts newer compatible contract versions" \
    _connector_is_possible_connector_dir "$test_dir/newer-compatible"
test "rejects older contract versions" \
    _expect_silent_failure _connector_is_possible_connector_dir "$test_dir/older"
test "rejects a different contract major version" \
    _expect_silent_failure _connector_is_possible_connector_dir "$test_dir/new-major"
test "rejects malformed contract versions" \
    _expect_silent_failure _connector_is_possible_connector_dir "$test_dir/malformed-version"

chmod -x "$test_dir/compatible/install_skill.sh"
test "requires executable operation scripts" \
    _expect_silent_failure _connector_is_possible_connector_dir "$test_dir/compatible"
chmod +x "$test_dir/compatible/install_skill.sh"

rm "$test_dir/compatible/connector.conf"
test "requires connector metadata" \
    _expect_silent_failure _connector_is_possible_connector_dir "$test_dir/compatible"

_connector_is_possible_connector_dir()
{
    printf '%s\n' "$1" >> "$test_dir/checked"
    [ "$1" = "$test_dir/connectors/available" ]
}

mkdir -p "$test_dir/connectors/available/nested" "$test_dir/connectors/unavailable"
touch "$test_dir/connectors/file"
_CR_INSTALL_DIR=$test_dir
connector_load_available > "$test_dir/output"

test_expect "loads only directories accepted by the connector predicate" \
    "$test_dir/connectors/available" cat "$test_dir/output"
test_expect "checks every connector directory" \
    "${test_dir}/connectors/available
${test_dir}/connectors/unavailable" cat "$test_dir/checked"

print_tests_summary

if some_tests_failed; then
    exit 1
fi
