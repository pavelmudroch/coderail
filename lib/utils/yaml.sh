#!/usr/bin/env sh

yaml_get_front_matter()
{
    message=$(echo "$1" | awk '
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

        {
            print
        }

        END {
            if (!started)
                exit 10

            if (!closed)
                exit 11
        }
    ' 2>&1)

    status=$?
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

    return 1
}