#!/usr/bin/env sh

md_is_frontmatter_valid()
{
    awk '
        NR == 1 {
            if ($0 != "---") {
                print "Missing starting '---'"
                exit 1
            }

            in_frontmatter = 1
            next
        }

        in_frontmatter && $0 == "---" {
            found_end = 1
            in_frontmatter = 0
            valid = 1
            exit 0
        }

        in_frontmatter {
            if ($0 == "") {
                next
            }

            if ($0 ~ /^[[:space:]]/) {
                print "Malformed line " NR ": " $0
                exit 1
            }

            colon = index($0, ":")

            if (colon == 0) {
                print "Malformed key:value at line " NR ": " $0
                exit 1
            }

            key = substr($0, 1, colon - 1)

            if (key !~ /^[a-z][a-z0-9-]*$/) {
                print "Invalid key \"" key "\" at line " NR
                exit 1
            }

            if (seen[key] == 1) {
                print "Duplicate key \"" key "\" at line " NR
                exit 1
            }

            seen[key] = 1
            next
        }

        END {
            if (NR == 0) {
                print "Missing starting '---'"
                exit 1
            }

            if (!found_end) {
                print "Missing ending '---'"
                exit 1
            }

            if (valid != 1) {
                exit 1
            }
        }
    '
}

md_frontmatter_get()
{
    key="$1"

    awk -v key="$key" '
        BEGIN {
            in_frontmatter = 1
        }

        NR == 1 {
            next
        }

        in_frontmatter && $0 == "---" {
            exit found ? 0 : 1
        }

        in_frontmatter {
            pos = index($0, ":")
            if (pos == 0)
                exit 1

            current_key = substr($0, 1, pos - 1)

            if (current_key == key) {
                value = substr($0, pos + 1)
                sub(/^[[:space:]]*/, "", value)
                print value
                found = 1
            }
        }

        END {
            if (found != 1) {
                exit 1
            }
        }
    '
}

md_frontmatter_set() {
    key=$1
    value=$2

    awk -v key="$key" -v value="$value" '
        BEGIN {
            in_frontmatter = 1
        }

        NR == 1 {
            print
            next
        }

        in_frontmatter {
            if ($0 == "---") {
                if (!found) {
                    print key ": " value
                }

                print
                in_frontmatter = 0
                next
            }

            separator = index($0, ":")
            if (separator) {
                line_key = substr($0, 1, separator - 1)

                if (line_key == key) {
                    print key ": " value
                    found = 1
                    next
                }
            }

            print
            next
        }

        {
            print
        }
    '
}

md_frontmatter_empty()
{
    printf '---\n---\n'
}