#!/usr/bin/env sh

# Private staged-payload renderer. The installer owns destination selection and
# installed-state mutation; this module only writes below its empty stage root.

_harness_render_name_valid()
{
    case "$1" in
        [A-Za-z0-9]* ) ;;
        *) return 1 ;;
    esac
    case "$1" in
        *[!A-Za-z0-9_-]*) return 1 ;;
    esac
}

_harness_render_relative_valid()
{
    case "$1" in
        ''|/*|*'//'|*/./*|*/../*|.|..|*/.|*/..|*"	"*|*"
"*) return 1 ;;
    esac
}

_harness_render_stage_empty()
{
    [ -d "$1" ] && [ ! -L "$1" ] || return 1
    [ -z "$(find "$1" -print 2>/dev/null | sed '1d;2q')" ]
}

_harness_render_validate_tree()
{
    _harness_render_tree=$1
    [ -d "$_harness_render_tree" ] && [ ! -L "$_harness_render_tree" ] || return 1
    _harness_render_invalid=$(find "$_harness_render_tree" \( -type l -o \( ! -type d -a ! -type f \) \) \
        -print 2>/dev/null) || return 1
    [ -z "$_harness_render_invalid" ] || return 1
    find "$_harness_render_tree" -type f -print | while IFS= read -r _harness_render_entry || \
        [ -n "$_harness_render_entry" ]; do
        [ -r "$_harness_render_entry" ] || exit 1
    done
}

_harness_render_skill_valid()
{
    _harness_render_skill=$1
    _harness_render_skill_dir=$2
    _harness_render_name_valid "$_harness_render_skill" || return 1
    _harness_render_skill_file=$_harness_render_skill_dir/SKILL.md
    [ -f "$_harness_render_skill_file" ] && [ ! -L "$_harness_render_skill_file" ] && \
        [ -r "$_harness_render_skill_file" ] || return 1

    _harness_render_front_state=0
    _harness_render_name_count=0
    _harness_render_description_count=0
    _harness_render_policy_count=0
    _harness_render_disable_model_invocation=false
    while IFS= read -r _harness_render_line || [ -n "$_harness_render_line" ]; do
        case "$_harness_render_front_state" in
            0)
                [ "$_harness_render_line" = '---' ] || return 1
                _harness_render_front_state=1
                ;;
            1)
                [ "$_harness_render_line" = '---' ] && break
                case "$_harness_render_line" in
                    name:*)
                        _harness_render_name_count=$((_harness_render_name_count + 1))
                        _harness_render_value=${_harness_render_line#name:}
                        _harness_render_value=${_harness_render_value# }
                        [ "$_harness_render_value" = "$_harness_render_skill" ] || return 1
                        ;;
                    description:*)
                        _harness_render_description_count=$((_harness_render_description_count + 1))
                        _harness_render_value=${_harness_render_line#description:}
                        _harness_render_value=${_harness_render_value# }
                        [ -n "$_harness_render_value" ] || return 1
                        ;;
                    disable-model-invocation:*)
                        _harness_render_policy_count=$((_harness_render_policy_count + 1))
                        case "$_harness_render_line" in
                            'disable-model-invocation: true')
                                _harness_render_disable_model_invocation=true
                                ;;
                            'disable-model-invocation: false')
                                _harness_render_disable_model_invocation=false
                                ;;
                            *) return 1 ;;
                        esac
                        ;;
                esac
                ;;
        esac
    done < "$_harness_render_skill_file"
    [ "$_harness_render_front_state" -eq 1 ] && [ "$_harness_render_line" = '---' ] && \
        [ "$_harness_render_name_count" -eq 1 ] && [ "$_harness_render_description_count" -eq 1 ] && \
        [ "$_harness_render_policy_count" -le 1 ]
}

_harness_render_markdown()
{
    _harness_render_source=$1
    _harness_render_destination=$2
    _harness_render_prefix=$3
    sed "s#<skill>\\([A-Za-z0-9][A-Za-z0-9_-]*\\)</skill>#$_harness_render_prefix\\1#g" \
        "$_harness_render_source" > "$_harness_render_destination"
}

_harness_render_codex_skill_markdown()
{
    _harness_render_source=$1
    _harness_render_destination=$2
    _harness_render_prefix=$3
    sed '2,/^---$/ { /^disable-model-invocation:/d; }
s#<skill>\([A-Za-z0-9][A-Za-z0-9_-]*\)</skill>#'"$_harness_render_prefix"'\1#g' \
        "$_harness_render_source" > "$_harness_render_destination"
}

_harness_render_copy_file()
{
    _harness_render_source=$1
    _harness_render_destination=$2
    _harness_render_prefix=$3
    _harness_render_harness=$4
    mkdir -p "$(dirname "$_harness_render_destination")" || return 1
    case "$_harness_render_source" in
        */SKILL.md)
            if [ "$_harness_render_harness" = codex ]; then
                _harness_render_codex_skill_markdown "$_harness_render_source" \
                    "$_harness_render_destination" "$_harness_render_prefix" || return 1
            else
                _harness_render_markdown "$_harness_render_source" \
                    "$_harness_render_destination" "$_harness_render_prefix" || return 1
            fi
            ;;
        *.md) _harness_render_markdown "$_harness_render_source" "$_harness_render_destination" "$_harness_render_prefix" || return 1 ;;
        *) cp -p "$_harness_render_source" "$_harness_render_destination" || return 1 ;;
    esac
    [ ! -x "$_harness_render_source" ] || chmod +x "$_harness_render_destination"
}

_harness_render_agent_scalar()
{
    _harness_render_value=$1
    _harness_render_destination=$2
    printf '%s\n' "$_harness_render_value" | awk '
        function fail() { exit 1 }
        {
            value = $0
            sub(/^[ \t]*/, "", value)
            sub(/[ \t]*$/, "", value)
            if (value == "") fail()
            first = substr(value, 1, 1)
            if (first == "\047") {
                if (length(value) < 2 || substr(value, length(value), 1) != "\047") fail()
                value = substr(value, 2, length(value) - 2)
                for (position = 1; position <= length(value); position++) {
                    character = substr(value, position, 1)
                    if (character == "\047") {
                        if (substr(value, position + 1, 1) != "\047") fail()
                        position++
                    }
                    printf "%s", character
                }
                exit
            }
            if (first == "\"") {
                if (length(value) < 2 || substr(value, length(value), 1) != "\"") fail()
                value = substr(value, 2, length(value) - 2)
                for (position = 1; position <= length(value); position++) {
                    character = substr(value, position, 1)
                    if (character == "\"") fail()
                    if (character != "\\") {
                        printf "%s", character
                        continue
                    }
                    position++
                    character = substr(value, position, 1)
                    if (character == "\\" || character == "\"") printf "%s", character
                    else if (character == "n") printf "\n"
                    else if (character == "r") printf "\r"
                    else if (character == "t") printf "\t"
                    else fail()
                }
                exit
            }
            printf "%s", value
        }
    ' > "$_harness_render_destination"
}

_harness_render_agent_valid()
{
    _harness_render_agent_source=$1
    _harness_render_agent_values=$2
    [ -f "$_harness_render_agent_source" ] && [ ! -L "$_harness_render_agent_source" ] && \
        [ -r "$_harness_render_agent_source" ] || return 1
    od -An -v -tx1 "$_harness_render_agent_source" | grep -q '00' && return 1

    _harness_render_agent_state=0
    _harness_render_agent_name_count=0
    _harness_render_agent_description_count=0
    while IFS= read -r _harness_render_line || [ -n "$_harness_render_line" ]; do
        case "$_harness_render_agent_state" in
            0)
                [ "$_harness_render_line" = '---' ] || return 1
                _harness_render_agent_state=1
                ;;
            1)
                if [ "$_harness_render_line" = '---' ]; then
                    _harness_render_agent_state=2
                    break
                fi
                case "$_harness_render_line" in
                    name:*)
                        _harness_render_agent_name_count=$((_harness_render_agent_name_count + 1))
                        [ "$_harness_render_agent_name_count" -eq 1 ] || return 1
                        _harness_render_agent_scalar "${_harness_render_line#name:}" \
                            "$_harness_render_agent_values/name" || return 1
                        ;;
                    description:*)
                        _harness_render_agent_description_count=$((_harness_render_agent_description_count + 1))
                        [ "$_harness_render_agent_description_count" -eq 1 ] || return 1
                        _harness_render_agent_scalar "${_harness_render_line#description:}" \
                            "$_harness_render_agent_values/description" || return 1
                        ;;
                    *) return 1 ;;
                esac
                ;;
        esac
    done < "$_harness_render_agent_source"
    [ "$_harness_render_agent_state" -eq 2 ] && \
        [ "$_harness_render_agent_name_count" -eq 1 ] && \
        [ "$_harness_render_agent_description_count" -eq 1 ] && \
        [ -s "$_harness_render_agent_values/name" ] && \
        [ -s "$_harness_render_agent_values/description" ]
}

_harness_render_agent_markdown()
{
    _harness_render_agent_source=$1
    _harness_render_agent_destination=$2
    _harness_render_prefix=$3
    sed '2,/^---$/! s#<skill>\([A-Za-z0-9][A-Za-z0-9_-]*\)</skill>#'"$_harness_render_prefix"'\1#g' \
        "$_harness_render_agent_source" > "$_harness_render_agent_destination"
}

_harness_render_toml_string()
{
    od -An -v -tu1 "$1" | while read -r _harness_render_toml_line || \
        [ -n "$_harness_render_toml_line" ]; do
        for _harness_render_toml_byte in $_harness_render_toml_line; do
            case "$_harness_render_toml_byte" in
                0) return 1 ;;
                8) printf '\\b' ;;
                9) printf '\\t' ;;
                10) printf '\\n' ;;
                12) printf '\\f' ;;
                13) printf '\\r' ;;
                34) printf '\\\"' ;;
                92) printf '\\\\' ;;
                [1-7]|1[1-9]|2[0-9]|3[0-1]|127) printf '\\u%04x' "$_harness_render_toml_byte" ;;
                *)
                    _harness_render_toml_octal=$(printf '%03o' "$_harness_render_toml_byte") || return 1
                    printf "\\$_harness_render_toml_octal"
                    ;;
            esac
        done
    done
}

_harness_render_agent_toml()
{
    _harness_render_agent_source=$1
    _harness_render_agent_values=$2
    _harness_render_agent_destination=$3
    _harness_render_prefix=$4
    _harness_render_agent_body=$_harness_render_agent_values/body
    sed '1d; 2,/^---$/d; s#<skill>\([A-Za-z0-9][A-Za-z0-9_-]*\)</skill>#'"$_harness_render_prefix"'\1#g' \
        "$_harness_render_agent_source" > "$_harness_render_agent_body" || return 1
    {
        printf 'name = "'
        _harness_render_toml_string "$_harness_render_agent_values/name" || exit 1
        printf '"\n'
        printf 'description = "'
        _harness_render_toml_string "$_harness_render_agent_values/description" || exit 1
        printf '"\n'
        printf 'developer_instructions = """'
        _harness_render_toml_string "$_harness_render_agent_body" || exit 1
        printf '"""\n'
    } > "$_harness_render_agent_destination"
}

_harness_render_agents_valid()
{
    _harness_render_agents=$1
    _harness_render_values_root=$2
    mkdir "$_harness_render_values_root" || return 1
    find "$_harness_render_agents" -mindepth 1 -print | LC_ALL=C sort | while \
        IFS= read -r _harness_render_agent_source || [ -n "$_harness_render_agent_source" ]; do
        [ -f "$_harness_render_agent_source" ] && [ ! -L "$_harness_render_agent_source" ] || exit 1
        _harness_render_agent_filename=${_harness_render_agent_source##*/}
        case "$_harness_render_agent_filename" in *.md) ;; *) exit 1 ;; esac
        _harness_render_agent_basename=${_harness_render_agent_filename%.md}
        _harness_render_name_valid "$_harness_render_agent_basename" || exit 1
        _harness_render_agent_values=$_harness_render_values_root/$_harness_render_agent_basename
        mkdir "$_harness_render_agent_values" || exit 1
        _harness_render_agent_valid "$_harness_render_agent_source" "$_harness_render_agent_values" || exit 1
        for _harness_render_agent_other in "$_harness_render_values_root"/*; do
            [ "$_harness_render_agent_other" = "$_harness_render_agent_values" ] && continue
            [ -d "$_harness_render_agent_other" ] || continue
            cmp -s "$_harness_render_agent_values/name" "$_harness_render_agent_other/name" && exit 1
        done
    done
}

harness_render()
{
    [ $# -eq 3 ] || return 1
    _harness_render_harness=$1
    _harness_render_bundle=$2
    _harness_render_stage=$3
    case "$_harness_render_harness" in
        codex) _harness_render_global=AGENTS.md; _harness_render_prefix='$' ;;
        claude) _harness_render_global=CLAUDE.md; _harness_render_prefix=/ ;;
        copilot) _harness_render_global=copilot-instructions.md; _harness_render_prefix=/ ;;
        gemini) _harness_render_global=GEMINI.md; _harness_render_prefix=/ ;;
        *) return 1 ;;
    esac
    _harness_render_stage_empty "$_harness_render_stage" || return 1
    _harness_render_instructions=$_harness_render_bundle/instructions
    _harness_render_agents=$_harness_render_instructions/agents
    _harness_render_skills=$_harness_render_instructions/skills
    _harness_render_global_source=$_harness_render_instructions/AGENTS.md
    [ -f "$_harness_render_global_source" ] && [ ! -L "$_harness_render_global_source" ] && \
        [ -r "$_harness_render_global_source" ] || return 1
    _harness_render_validate_tree "$_harness_render_instructions" || return 1
    _harness_render_validate_tree "$_harness_render_skills" || return 1
    _harness_render_validate_tree "$_harness_render_agents" || return 1

    find "$_harness_render_skills" -print | LC_ALL=C sort | while IFS= read -r _harness_render_directory || \
        [ -n "$_harness_render_directory" ]; do
        [ "$_harness_render_directory" = "$_harness_render_skills" ] && continue
        [ "$_harness_render_directory" = "$_harness_render_skills/.system" ] && continue
        [ "$(dirname "$_harness_render_directory")" = "$_harness_render_skills" ] || continue
        printf '%s\n' "$_harness_render_directory"
    done > "$_harness_render_stage/.skills" || return 1
    while IFS= read -r _harness_render_skill_dir || [ -n "$_harness_render_skill_dir" ]; do
        _harness_render_skill=${_harness_render_skill_dir##*/}
        _harness_render_skill_valid "$_harness_render_skill" "$_harness_render_skill_dir" || return 1
    done < "$_harness_render_stage/.skills"
    _harness_render_agents_valid "$_harness_render_agents" \
        "$_harness_render_stage/.agent-values" || return 1

    _harness_render_copy_file "$_harness_render_global_source" \
        "$_harness_render_stage/$_harness_render_global" "$_harness_render_prefix" \
        "$_harness_render_harness" || return 1
    while IFS= read -r _harness_render_skill_dir || [ -n "$_harness_render_skill_dir" ]; do
        find "$_harness_render_skill_dir" -type f -print | LC_ALL=C sort > "$_harness_render_stage/.files" || return 1
        _harness_render_skill=${_harness_render_skill_dir##*/}
        _harness_render_skill_valid "$_harness_render_skill" "$_harness_render_skill_dir" || return 1
        while IFS= read -r _harness_render_source || [ -n "$_harness_render_source" ]; do
            _harness_render_relative=${_harness_render_source#"$_harness_render_skill_dir/"}
            _harness_render_relative_valid "$_harness_render_relative" || return 1
            if [ "$_harness_render_harness" = codex ] && \
                [ "$_harness_render_relative" = agents/openai.yaml ]; then
                return 1
            fi
            _harness_render_copy_file "$_harness_render_source" \
                "$_harness_render_stage/skills/$_harness_render_skill/$_harness_render_relative" \
                "$_harness_render_prefix" "$_harness_render_harness" || return 1
        done < "$_harness_render_stage/.files"
        if [ "$_harness_render_harness" = codex ] && \
            [ "$_harness_render_disable_model_invocation" = true ]; then
            mkdir -p "$_harness_render_stage/skills/$_harness_render_skill/agents" || return 1
            printf '%s\n' 'policy:' '  allow_implicit_invocation: false' \
                > "$_harness_render_stage/skills/$_harness_render_skill/agents/openai.yaml" || return 1
        fi
    done < "$_harness_render_stage/.skills"
    find "$_harness_render_agents" -mindepth 1 -type f -print | LC_ALL=C sort | while \
        IFS= read -r _harness_render_agent_source || [ -n "$_harness_render_agent_source" ]; do
        _harness_render_agent_filename=${_harness_render_agent_source##*/}
        _harness_render_agent_basename=${_harness_render_agent_filename%.md}
        _harness_render_agent_values=$_harness_render_stage/.agent-values/$_harness_render_agent_basename
        mkdir -p "$_harness_render_stage/agents" || exit 1
        case "$_harness_render_harness" in
            codex)
                _harness_render_agent_toml "$_harness_render_agent_source" \
                    "$_harness_render_agent_values" \
                    "$_harness_render_stage/agents/$_harness_render_agent_basename.toml" \
                    "$_harness_render_prefix" || exit 1
                ;;
            copilot)
                _harness_render_agent_markdown "$_harness_render_agent_source" \
                    "$_harness_render_stage/agents/$_harness_render_agent_basename.agent.md" \
                    "$_harness_render_prefix" || exit 1
                ;;
            *)
                _harness_render_agent_markdown "$_harness_render_agent_source" \
                    "$_harness_render_stage/agents/$_harness_render_agent_filename" \
                    "$_harness_render_prefix" || exit 1
                ;;
        esac
    done || return 1
    rm -rf "$_harness_render_stage/.agent-values" || return 1
    rm -f "$_harness_render_stage/.skills" "$_harness_render_stage/.files" || return 1
}
