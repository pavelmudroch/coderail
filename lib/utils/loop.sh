#!/usr/bin/env sh

loop_ensure_outer_ignore() {
    loop_outer_project_dir=$1
    loop_outer_dir=$loop_outer_project_dir/.coderail
    loop_outer_ignore_file=$loop_outer_dir/.gitignore

    mkdir -p "$loop_outer_dir" ||
        return 1

    if loop_verify_ignore_policy "$loop_outer_project_dir"; then
        printf '%s\n' false
        return 0
    fi

    if [ -e "$loop_outer_ignore_file" ] || [ -L "$loop_outer_ignore_file" ]; then
        [ -f "$loop_outer_ignore_file" ] && [ ! -L "$loop_outer_ignore_file" ] ||
            return 1

        if [ -s "$loop_outer_ignore_file" ] &&
            [ "$(tail -c 1 "$loop_outer_ignore_file" | wc -l | tr -d '[:space:]')" = 0 ]; then
            printf '\n' >> "$loop_outer_ignore_file" ||
                return 1
        fi
    fi

    printf 'loop\n' >> "$loop_outer_ignore_file" ||
        return 1
    printf '%s\n' true
}

loop_create_directory() {
    loop_create_project_dir=$1

    mkdir -p "$loop_create_project_dir/.coderail/loop"
}

loop_verify_ignore_policy() {
    loop_verify_project_dir=$1
    loop_verify_ignore_file=$loop_verify_project_dir/.coderail/.gitignore

    [ -f "$loop_verify_ignore_file" ] &&
        [ ! -L "$loop_verify_ignore_file" ] ||
        return 1

    grep -Fxe loop -e 'loop/' "$loop_verify_ignore_file" >/dev/null 2>&1 ||
        return 1

    if git -C "$loop_verify_project_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git -C "$loop_verify_project_dir" check-ignore -q -- .coderail/loop/transcript.txt
        return
    fi

    awk '
        function trim_unescaped_trailing_whitespace(rule,    end, slashes) {
            while (rule ~ /[[:space:]]$/) {
                end = length(rule) - 1
                slashes = 0

                while (end > 0 && substr(rule, end, 1) == "\\") {
                    slashes++
                    end--
                }

                if (slashes % 2) {
                    return rule
                }

                rule = substr(rule, 1, end)
            }

            return rule
        }

        {
            rule = trim_unescaped_trailing_whitespace($0)
        }

        rule == "loop" || rule == "loop/" {
            ignored = 1
        }

        rule == "!loop" || rule == "!loop/" {
            ignored = 0
        }

        END {
            exit !ignored
        }
    ' "$loop_verify_ignore_file"
}

loop_remove() {
    loop_remove_project_dir=$1
    loop_remove_dir=$loop_remove_project_dir/.coderail/loop

    [ -e "$loop_remove_dir" ] || [ -L "$loop_remove_dir" ] ||
        return 0

    rm -rf -- "$loop_remove_dir"
}

loop_discovery_state() {
    loop_discovery_state_file=$1

    awk '
        NR == 1 && $0 == "---" {
            in_frontmatter = 1
            next
        }

        !in_frontmatter {
            exit 1
        }

        in_frontmatter && $0 == "---" {
            has_frontmatter_end = 1
            exit
        }

        in_frontmatter && $0 ~ /^resolved[[:space:]]*:/ {
            resolved_count++

            if ($0 == "resolved: true") {
                state = "resolved"
            } else if ($0 == "resolved: false") {
                state = "unresolved"
            } else {
                invalid_resolved = 1
            }
        }

        END {
            if (has_frontmatter_end && resolved_count == 1 && !invalid_resolved) {
                print state
                exit 0
            }

            exit 1
        }
    ' "$loop_discovery_state_file"
}
