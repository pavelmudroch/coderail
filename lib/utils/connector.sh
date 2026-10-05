#!/usr/bin/env sh

connector_install_skill()
{
    skill_directory="$1"
    temp_home="$2"
    # installs a skill for the connector
    # prints out all installed files, each on a new line
    :
}

connector_install_sub_agent()
{
    sub_agent_file="$1"
    temp_home="$2"
    # installs a sub agent for the connector
    # prints out all installed files, each on a new line
    :
}

connector_install_global_instruction()
{
    global_instruction_file="$1"
    temp_home="$2"
    # installs a global instruction for the connector
    # prints out all installed files, each on a new line
    :
}

connector_load_available()
{
    # returns all available connectors, one per line
    connectors_directory="$_CR_INSTALL_DIR/connectors"

    [ -d "$connectors_directory" ] || return 0

    for connector_directory in "$connectors_directory"/*; do
        [ -d "$connector_directory" ] || continue

        if _connector_is_possible_connector_dir "$connector_directory"; then
            printf '%s\n' "$connector_directory"
        fi
    done
}

_connector_is_possible_connector_dir()
{
    connector_min_required_version="1.0"
    possible_connector_dir="$1"

    [ -d "$possible_connector_dir" ] || return 1
    [ -f "$possible_connector_dir/connector.conf" ] || return 1
    [ -r "$possible_connector_dir/connector.conf" ] || return 1

    for connector_required_file in \
        install_global_instruction.sh \
        install_skill.sh \
        install_sub_agent.sh \
        prompt_and_wait.sh
    do
        connector_required_path="$possible_connector_dir/$connector_required_file"
        [ -f "$connector_required_path" ] || return 1
        [ -r "$connector_required_path" ] || return 1
        [ -x "$connector_required_path" ] || return 1
    done

    connector_contract_version=$(awk '
        function trim(value) {
            sub(/^[[:space:]]+/, "", value)
            sub(/[[:space:]]+$/, "", value)
            return value
        }

        {
            line = trim($0)
            if (line == "" || line ~ /^#/) next
            if (line !~ /=/) next

            key = trim(substr(line, 1, index(line, "=") - 1))
            if (key == "contract_version") {
                print trim(substr(line, index(line, "=") + 1))
                exit
            }
        }
    ' "$possible_connector_dir/connector.conf") || return 1

    _connector_contract_version_is_compatible \
        "$connector_contract_version" "$connector_min_required_version"
}

_connector_contract_version_is_compatible()
{
    connector_contract_version="$1"
    connector_required_version="$2"

    awk -v contract_version="$connector_contract_version" \
        -v required_version="$connector_required_version" '
        function is_version_part(value) {
            return value ~ /^(0|[1-9][0-9]*)$/
        }

        function is_version(value, patch_optional, parts, count, part_index) {
            count = split(value, parts, ".")
            if (count != 3 && !(patch_optional && count == 2)) return 0

            for (part_index = 1; part_index <= count; part_index++) {
                if (!is_version_part(parts[part_index])) return 0
            }
            return 1
        }

        function compare_numbers(left, right, char_index, left_digit, right_digit) {
            if (length(left) < length(right)) return -1
            if (length(left) > length(right)) return 1

            for (char_index = 1; char_index <= length(left); char_index++) {
                left_digit = index("0123456789", substr(left, char_index, 1))
                right_digit = index("0123456789", substr(right, char_index, 1))
                if (left_digit < right_digit) return -1
                if (left_digit > right_digit) return 1
            }
            return 0
        }

        BEGIN {
            if (!is_version(contract_version, 0) ||
                !is_version(required_version, 1)) exit 1

            split(contract_version, contract_parts, ".")
            required_part_count = split(required_version, required_parts, ".")
            if (required_part_count == 2) required_parts[3] = "0"

            if (compare_numbers(contract_parts[1], required_parts[1]) != 0) exit 1

            comparison = compare_numbers(contract_parts[2], required_parts[2])
            if (comparison > 0) exit 0
            if (comparison < 0) exit 1

            exit compare_numbers(contract_parts[3], required_parts[3]) >= 0 ? 0 : 1
        }
    '
}
