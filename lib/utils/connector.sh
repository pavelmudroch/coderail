#!/usr/bin/env sh

connector_get_default_home()
{
    connector="$1"
    eval "default_home=\${$(echo "$connector" | tr '[:lower:]' '[:upper:]')_HOME}"
    if [ -n "$default_home" ]; then
        printf '%s\n' "$default_home"
        return 0
    fi

    if [ -f "$_CR_INSTALL_DIR/connectors/$connector/connector.conf" ]; then
        default_home=$(awk -F= '
            function trim(value) {
                sub(/^[[:space:]]+/, "", value)
                sub(/[[:space:]]+$/, "", value)
                return value
            }
            /^#/ { next }
            /^[[:space:]]*$/ { next }
            {
                key = trim($1)
                value = trim($2)
                if (key == "default_home") {
                    print value
                    exit
                }
            }
        ' "$_CR_INSTALL_DIR/connectors/$connector/connector.conf")
        if [ -n "$default_home" ]; then
            printf '%s\n' "$default_home"
            return 0
        fi
    fi

    return 1
}

connector_get_default_command()
{
    connector="$1"
    eval "default_command=\${$(echo "$connector" | tr '[:lower:]' '[:upper:]')_COMMAND}"
    if [ -n "$default_command" ]; then
        printf '%s\n' "$default_command"
        return 0
    fi

    if [ -f "$_CR_INSTALL_DIR/connectors/$connector/connector.conf" ]; then
        default_command=$(awk -F= '
            function trim(value) {
                sub(/^[[:space:]]+/, "", value)
                sub(/[[:space:]]+$/, "", value)
                return value
            }
            /^#/ { next }
            /^[[:space:]]*$/ { next }
            {
                key = trim($1)
                value = trim($2)
                if (key == "default_command") {
                    print value
                    exit
                }
            }
        ' "$_CR_INSTALL_DIR/connectors/$connector/connector.conf")
        if [ -n "$default_command" ]; then
            printf '%s\n' "$default_command"
            return 0
        fi
    fi

    return 1
}

connector_install_skill()
{
    connector="$1"
    skill_directory="$2"
    temp_home="$3"
    (
        connector_script="$_CR_INSTALL_DIR/connectors/$connector/install_skill.sh"
        set -- "$skill_directory" "$temp_home"
        . "$connector_script"
    )
}

connector_install_sub_agent()
{
    connector="$1"
    sub_agent_file="$2"
    temp_home="$3"
    (
        connector_script="$_CR_INSTALL_DIR/connectors/$connector/install_sub_agent.sh"
        set -- "$sub_agent_file" "$temp_home"
        . "$connector_script"
    )
}

connector_install_global_instruction()
{
    connector="$1"
    global_instruction_file="$2"
    temp_home="$3"
    (
        connector_script="$_CR_INSTALL_DIR/connectors/$connector/install_global_instruction.sh"
        set -- "$global_instruction_file" "$temp_home"
        . "$connector_script"
    )
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

connector_is_available()
{
    connector="$1"
    _connector_is_possible_connector_dir "$_CR_INSTALL_DIR/connectors/$connector"
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
