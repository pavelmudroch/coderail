#!/usr/bin/env sh

work_read_record() {
    [ "$#" -eq 1 ] || return 1

    work_record_file=$1
    [ -f "$work_record_file" ] && [ -r "$work_record_file" ] || return 1

    work_base_branch=
    work_branch=
    work_name=
    work_record_base_seen=0
    work_record_branch_seen=0
    work_record_name_seen=0

    while IFS= read -r work_record_line || [ -n "$work_record_line" ]; do
        case "$work_record_line" in
            base_branch=*)
                [ "$work_record_base_seen" -eq 0 ] || return 1
                work_base_branch=${work_record_line#base_branch=}
                [ -n "$work_base_branch" ] || return 1
                work_record_base_seen=1
                ;;
            work_branch=*)
                [ "$work_record_branch_seen" -eq 0 ] || return 1
                work_branch=${work_record_line#work_branch=}
                [ -n "$work_branch" ] || return 1
                work_record_branch_seen=1
                ;;
            work_name=*)
                [ "$work_record_name_seen" -eq 0 ] || return 1
                work_name=${work_record_line#work_name=}
                [ -n "$work_name" ] || return 1
                work_record_name_seen=1
                ;;
            *)
                return 1
                ;;
        esac
    done < "$work_record_file"

    [ "$work_record_base_seen" -eq 1 ] &&
        [ "$work_record_branch_seen" -eq 1 ] &&
        [ "$work_record_name_seen" -eq 1 ]
}
