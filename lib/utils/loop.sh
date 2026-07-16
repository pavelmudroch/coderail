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
