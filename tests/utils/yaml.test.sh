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
. "$PROJECT_ROOT/lib/utils/yaml.sh"

_test_parse_simple_front_matter()
{
    input="---
title: My Title
---

# Lorem Ipsum

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
"
    expected="title: My Title"
    actual=$(yaml_get_front_matter "$input")

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_test_parse_empty_front_matter()
{
    input="---
---

# Lorem Ipsum

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
"
    expected=""
    actual=$(yaml_get_front_matter "$input")

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_test_parse_extended_front_matter()
{
    input="---
title: My Title
description: This is a description.
items: item1, item2, item3
---
# Lorem Ipsum
Lorem ipsum dolor sit amet, consectetur adipiscing elit.
"
    expected="title: My Title
description: This is a description.
items: item1, item2, item3"
    actual=$(yaml_get_front_matter "$input")

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_test_parse_missing_front_matter()
{
    input="# Lorem Ipsum

---
This should not be parsed as front matter.
---

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
"
    expected="Missing front matter start delimiter '---'"

    if actual=$(yaml_get_front_matter "$input"); then
        printf 'Expected parsing to fail\n'
        return 1
    fi

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_test_parse_malformed1_front_matter()
{
    input="title: My Title
---
This line is malformed and should cause an error.

# Lorem Ipsum

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
"
    expected="Missing front matter start delimiter '---'"

    if actual=$(yaml_get_front_matter "$input"); then
        printf 'Expected parsing to fail\n'
        return 1
    fi

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_test_parse_malformed2_front_matter()
{
    input="---
title: My Title
description: This is a description.
items: item1, item2, item3
This line is malformed and should cause an error.
---

# Lorem Ipsum

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
"
    expected="Malformed front matter line"

    if actual=$(yaml_get_front_matter "$input"); then
        printf 'Expected parsing to fail\n'
        return 1
    fi

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_test_parse_malformed3_front_matter()
{
    input="---
title: My Title
description: This is a description.
items: item1, item2, item3"
    expected="Missing front matter end delimiter '---'"

    if actual=$(yaml_get_front_matter "$input"); then
        printf 'Expected parsing to fail\n'
        return 1
    fi

    if [ "$actual" != "$expected" ]; then
        printf 'Expected "%s" but got "%s"\n' "$expected" "$actual"
        return 1
    fi
}

_assert_front_matter_key()
{
    front_matter="---
key: value
description: This is a description.
items: item1, item2, item3
---
# title
"
    key="$1"
    expected_value="$2"

    if actual_value=$(yaml_get_front_matter_key "$front_matter" "$key"); then
        if [ "$actual_value" != "$expected_value" ]; then
            printf 'Expected "%s" but got "%s"\n' "$expected_value" "$actual_value"
            return 1
        fi
    else
        printf 'Failed to get value for key "%s"\n' "$key"
        return 1
    fi
}

print_tests_header "YAML Utils Tests"

test "parse simple front matter" _test_parse_simple_front_matter
test "parse empty front matter" _test_parse_empty_front_matter
test "parse extended front matter" _test_parse_extended_front_matter
test "parse missing front matter" _test_parse_missing_front_matter
test "parse malformed front matter" _test_parse_malformed1_front_matter
test "parse malformed front matter 2" _test_parse_malformed2_front_matter
test "parse malformed front matter 3" _test_parse_malformed3_front_matter

test "get front matter key (key)" _assert_front_matter_key "key" "value"
test "get front matter key (description)" _assert_front_matter_key "description" "This is a description."
test "get front matter key (items)" _assert_front_matter_key "items" "item1, item2, item3"
test "get front matter key (nonexistent)" _assert_front_matter_key "nonexistent" ""

print_tests_summary

if some_tests_failed; then
    exit 1
fi
