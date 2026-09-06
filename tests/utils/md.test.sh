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

_test_frontmatter_get()
{
    markdown="$(_read_markdown)"
    printf '%s' "$markdown" | md_frontmatter_get "title"
}

_test_frontmatter_set()
{
    markdown="$(_read_markdown)"
    printf '%s' "$markdown" | md_frontmatter_set "status" "ready" | md_frontmatter_get "status"
}

print_tests_header "Markdown Utils Tests"

test_expect "Validation: front matter is valid" "" _test_validate_ok
test_expect_fail "Validation: missing start delimiter" "Missing starting \"---\"" _test_validate_missing_start_delimiter
test_expect_fail "Validation: missing end delimiter" "Missing ending \"---\"" _test_validate_missing_end_delimiter
test_expect_fail "Validation: malformed key:value" "Malformed key:value at line 3: title= Sample Title" _test_validate_malformed_key_value
test_expect_fail "Validation: malformed key" "Invalid key \"tit@le\" at line 3" _test_validate_malformed_key
test_expect_fail "Validation: duplicate key" "Duplicate key \"status\" at line 3" _test_validate_duplicate_key
test_expect "Get front matter key value" "Sample Title" _test_frontmatter_get
test_expect "Set front matter key value" "ready" _test_frontmatter_set

print_tests_summary

if some_tests_failed; then
    exit 1
fi
