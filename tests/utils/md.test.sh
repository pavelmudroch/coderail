#!/usr/bin/env sh

set -eu

SCRIPT_DIR=$(
    CDPATH= cd -- "$(dirname "$0")"
    pwd
)

PROJECT_ROOT=$(
    CDPATH= cd -- "$SCRIPT_DIR/../.."
    pwd
)

. "$PROJECT_ROOT/tests/suite.sh"
. "$PROJECT_ROOT/lib/utils/md.sh"

_read_markdown()
{
    echo "---
status: forging
title: Sample Title
description: This is a sample description.
---
# Heading

This is some sample content under the heading.

Another paragraph of sample content.
"
}

_test_expect()
{
    expect="$1"
    shift

    if output=$("$@" 2>&1); then
        if [ "$output" != "$expect" ]; then
            echo "Got: $output, Expected: $expect"
            return 1
        fi
        return 0
    else
        echo "$output"
        return 1
    fi
}

_test_validate_ok()
{
    md_is_frontmatter_valid $(_read_markdown)
}

_test_validate_missing_start_delimiter()
{
    markdown="status: forging
title: Sample Title
description: This is a sample description.
---
"
    md_is_frontmatter_valid "$markdown"
}

print_tests_header "Markdown Utils Tests"

test "Validation: front matter is valid" _test_expect "" _test_validate_ok
test "Validation: missing start delimiter" _test_expect "Missing starting '---'" _test_validate_missing_start_delimiter

print_tests_summary

if some_tests_failed; then
    exit 1
fi
