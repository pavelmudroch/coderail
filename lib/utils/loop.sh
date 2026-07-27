#!/usr/bin/env sh

loop_setup() {
    loop_setup_project_dir=$1
    loop_setup_dir=$loop_setup_project_dir/.coderail/loop
    loop_setup_ignore_file=$loop_setup_dir/.gitignore

    mkdir -p "$loop_setup_dir" ||
        return 1

    if [ -e "$loop_setup_ignore_file" ] || [ -L "$loop_setup_ignore_file" ]; then
        printf '%s\n' false
        return 0
    fi

    printf '*\n!.gitignore\n' > "$loop_setup_ignore_file" ||
        return 1
    printf '%s\n' true
}

loop_verify_ignore_policy() {
    loop_verify_project_dir=$1
    loop_verify_ignore_file=$loop_verify_project_dir/.coderail/loop/.gitignore

    [ -f "$loop_verify_ignore_file" ] &&
        [ ! -L "$loop_verify_ignore_file" ] ||
        return 1

    printf '*\n!.gitignore\n' |
        cmp "$loop_verify_ignore_file" - >/dev/null 2>&1
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
