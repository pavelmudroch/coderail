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
        echo "Command failed with output:"
        echo "$output"
        return 1
    fi
}

_test_expect_fail()
{
    expect="$1"
    shift

    if output=$("$@" 2>&1); then
        echo "Expected failure, but command succeeded with output:"
        echo "$output"
        return 1
    else
        if [ "$output" != "$expect" ]; then
            echo "Got: $output, Expected: $expect"
            return 1
        fi
        return 0
    fi
}

_test_validate_ok()
{
    markdown="$(_read_markdown)"
    md_is_frontmatter_valid "$markdown"
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

_test_validate_missing_end_delimiter()
{
    markdown="---
status: forging
title: Sample Title
description: This is a sample description.
"
    md_is_frontmatter_valid "$markdown"
}

_test_validate_malformed_key_value()
{
    markdown="---
status: forging
title= Sample Title
description: This is a sample description.
---
# Heading
"
    md_is_frontmatter_valid "$markdown"
}

_test_validate_malformed_key()
{
    markdown="---
status: forging
tit@le: Sample Title
description: This is a sample description.
---
# Heading
"
    md_is_frontmatter_valid "$markdown"
}

_test_validate_duplicate_key()
{
    markdown="---
status: forging
status: another status
description: This is a sample description.
---
# Heading
"
    md_is_frontmatter_valid "$markdown"
}

print_tests_header "Markdown Utils Tests"

test "Validation: front matter is valid" _test_expect "" _test_validate_ok
test "Validation: missing start delimiter" _test_expect_fail "Missing starting \"---\"" _test_validate_missing_start_delimiter
test "Validation: missing end delimiter" _test_expect_fail "Missing ending \"---\"" _test_validate_missing_end_delimiter
test "Validation: malformed key:value" _test_expect_fail "Malformed key:value at line 3: title= Sample Title" _test_validate_malformed_key_value
test "Validation: malformed key" _test_expect_fail "Invalid key \"tit@le\" at line 3" _test_validate_malformed_key
test "Validation: duplicate key" _test_expect_fail "Duplicate key \"status\" at line 3" _test_validate_duplicate_key

print_tests_summary

if some_tests_failed; then
    exit 1
fi
