#!/usr/bin/env sh

yaml_get_front_matter()
{
    if message=$(echo "$1" | awk '
        NR == 1 {
            if ($0 != "---")
                exit 10

            started = 1
            next
        }

        $0 == "---" {
            closed = 1
            exit
        }

        $0 !~ /^[^[:space:]:][^:]*:[[:space:]]+[^[:space:]]/ {
            malformed = 1
            exit
        }

        {
            print
        }

        END {
            if (malformed)
                exit 12

            if (!started)
                exit 10

            if (!closed)
                exit 11
        }
    ' 2>&1); then
        status=0
    else
        status=$?
    fi
    case $status in
        0)
            echo "$message"
            return 0
            ;;
        10)
            echo "Missing front matter start delimiter '---'"
            ;;
        11)
            echo "Missing front matter end delimiter '---'"
            ;;
        12)
            echo "Malformed front matter line"
            ;;
        *)
            echo "$message"
            ;;
    esac
    return 1
}

yaml_get_front_matter_key()
{
    front_matter="$1"
    key="$2"

    while IFS= read -r line; do
        case "$line" in
            "$key:"*)
                value=${line#*:}

                # Trim leading whitespace and double quotes.
                value=${value#"${value%%[![:space:]]*}"}
                value=${value#\"}

                # Trim trailing whitespace and double quotes.
                value=${value%"${value##*[![:space:]]}"}
                value=${value%\"}
                printf '%s\n' "$value"
                return 0
                ;;
        esac
    done <<EOF
$front_matter
EOF

    printf ''
}

yaml_update_front_matter_key()
{
    front_matter="$1"
    key="$2"
    new_value="$3"

    updated_front_matter=""
    while IFS= read -r line; do
        case "$line" in
            "$key:"*)
                line="$key: $new_value"
                ;;
        esac
        updated_front_matter="$updated_front_matter$line\n"
    done <<EOF
$front_matter
EOF

    printf '%b' "$updated_front_matter"
}
