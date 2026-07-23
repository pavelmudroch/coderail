#!/usr/bin/env sh

_ticket_error() {
    printf 'error: %s\n' "$1" >&2
    return 1
}

_ticket_valid_state() {
    case "$1" in
        open|active|closed) return 0 ;;
        *) return 1 ;;
    esac
}

_ticket_normalize_id() {
    [ "$#" -eq 1 ] || _ticket_error "_ticket_normalize_id expects 1 argument" || return 1

    _ticket_normalize_id_value=$1

    case "$_ticket_normalize_id_value" in
        ''|*[!0123456789]*)
            _ticket_error "invalid ticket id: $_ticket_normalize_id_value"
            return 1
            ;;
    esac

    case "$_ticket_normalize_id_value" in
        *[123456789]*) ;;
        *)
            _ticket_error "ticket id must be positive: $_ticket_normalize_id_value"
            return 1
            ;;
    esac

    while [ "${#_ticket_normalize_id_value}" -lt 4 ]; do
        _ticket_normalize_id_value=0$_ticket_normalize_id_value
    done

    printf '%s\n' "$_ticket_normalize_id_value"
}

_ticket_project_dir() {
    _ticket_project_dir_path=$1

    [ -d "$_ticket_project_dir_path" ] ||
        _ticket_error "project directory not found: $_ticket_project_dir_path" ||
        return 1

    CDPATH= cd -- "$_ticket_project_dir_path" && pwd -P
}

_ticket_file_dir() {
    _ticket_file_dir_path=$1
    _ticket_file_dir_name=$(dirname "$_ticket_file_dir_path")

    [ -d "$_ticket_file_dir_name" ] ||
        _ticket_error "ticket directory not found: $_ticket_file_dir_name" ||
        return 1

    CDPATH= cd -- "$_ticket_file_dir_name" && pwd -P
}

_ticket_file_path() {
    _ticket_file_path_dir=$(_ticket_file_dir "$1") || return 1
    _ticket_file_path_base=$(basename "$1")

    printf '%s/%s\n' "$_ticket_file_path_dir" "$_ticket_file_path_base"
}

_ticket_existing_path_reference() {
    _ticket_existing_project=$1
    _ticket_existing_reference=$2

    case "$_ticket_existing_reference" in
        /*) _ticket_existing_file=$_ticket_existing_reference ;;
        *) _ticket_existing_file=$_ticket_existing_project/$_ticket_existing_reference ;;
    esac

    [ -f "$_ticket_existing_file" ] ||
        _ticket_error "ticket path not found: $_ticket_existing_reference" ||
        return 1

    _ticket_existing_base=$(basename "$_ticket_existing_file")
    case "$_ticket_existing_base" in
        *.md) ;;
        *)
            _ticket_error "ticket path must have .md extension: $_ticket_existing_reference"
            return 1
            ;;
    esac

    _ticket_existing_project_path=$(_ticket_project_dir "$_ticket_existing_project") || return 1
    _ticket_existing_dir=$(_ticket_file_dir "$_ticket_existing_file") || return 1

    for _ticket_existing_state in open active closed; do
        if [ "$_ticket_existing_dir" = "$_ticket_existing_project_path/.coderail/tickets/$_ticket_existing_state" ]; then
            printf '.coderail/tickets/%s/%s\n' "$_ticket_existing_state" "$_ticket_existing_base"
            return 0
        fi
    done

    _ticket_error "ticket path is not under .coderail/tickets: $_ticket_existing_reference"
    return 1
}

_ticket_search_reference() {
    _ticket_search_project=$1
    _ticket_search_mode=$2
    _ticket_search_value=$3
    _ticket_search_reference=$4
    _ticket_search_count=0
    _ticket_search_match=

    for _ticket_search_state in open active closed; do
        _ticket_search_dir=$_ticket_search_project/.coderail/tickets/$_ticket_search_state

        for _ticket_search_file in "$_ticket_search_dir"/*.md; do
            [ -f "$_ticket_search_file" ] || continue

            _ticket_search_base=$(basename "$_ticket_search_file")
            case "$_ticket_search_mode" in
                id)
                    _ticket_search_current=$(ticket_id_from_name "$_ticket_search_base" 2>/dev/null) || continue
                    ;;
                name)
                    _ticket_search_current=$_ticket_search_base
                    ;;
                slug)
                    _ticket_search_current=$(ticket_slug_from_name "$_ticket_search_base" 2>/dev/null) || continue
                    ;;
                *)
                    _ticket_error "unknown ticket reference search mode: $_ticket_search_mode"
                    return 1
                    ;;
            esac

            [ "$_ticket_search_current" = "$_ticket_search_value" ] || continue

            _ticket_search_count=$((_ticket_search_count + 1))
            _ticket_search_match=.coderail/tickets/$_ticket_search_state/$_ticket_search_base

            if [ "$_ticket_search_count" -gt 1 ]; then
                _ticket_error "ambiguous ticket reference: $_ticket_search_reference"
                return 1
            fi
        done
    done

    if [ "$_ticket_search_count" -eq 0 ]; then
        _ticket_error "ticket reference not found: $_ticket_search_reference"
        return 1
    fi

    printf '%s\n' "$_ticket_search_match"
}

_ticket_frontmatter_value() {
    _ticket_frontmatter_file=$1
    _ticket_frontmatter_key=$2

    awk -v key="$_ticket_frontmatter_key" '
        BEGIN { found = 1 }
        NR == 1 && $0 == "---" { in_frontmatter = 1; next }
        NR == 1 { exit 1 }
        in_frontmatter && $0 == "---" { exit found }
        in_frontmatter && index($0, key ":") == 1 {
            value = substr($0, length(key) + 2)
            sub(/^[[:space:]]*/, "", value)
            print value
            found = 0
            exit
        }
        END { exit found }
    ' "$_ticket_frontmatter_file"
}

_ticket_has_frontmatter() {
    _ticket_has_frontmatter_file=$1

    awk '
        NR == 1 && $0 == "---" { in_frontmatter = 1; next }
        NR == 1 { exit 1 }
        in_frontmatter && $0 == "---" { found = 1; exit }
        END { exit found ? 0 : 1 }
    ' "$_ticket_has_frontmatter_file"
}

_ticket_has_frontmatter_key() {
    _ticket_frontmatter_value "$1" "$2" >/dev/null
}

_ticket_require_frontmatter_key() {
    _ticket_require_frontmatter_key_file=$1
    _ticket_require_frontmatter_key_name=$2

    _ticket_has_frontmatter_key "$_ticket_require_frontmatter_key_file" "$_ticket_require_frontmatter_key_name" ||
        _ticket_error "missing ticket field: $_ticket_require_frontmatter_key_name"
}

_ticket_rewrite_lifecycle() {
    _ticket_rewrite_file=$1
    _ticket_rewrite_state=$2
    _ticket_rewrite_updated_at=$3
    _ticket_rewrite_tmp=$_ticket_rewrite_file.tmp.$$

    case "$_ticket_rewrite_state" in
        open|active) _ticket_rewrite_remove_closed_fields=1 ;;
        *) _ticket_rewrite_remove_closed_fields=0 ;;
    esac

    if ! awk \
        -v state="$_ticket_rewrite_state" \
        -v updated_at="$_ticket_rewrite_updated_at" \
        -v remove_closed_fields="$_ticket_rewrite_remove_closed_fields" '
            NR == 1 && $0 == "---" {
                in_frontmatter = 1
                print
                next
            }
            NR == 1 { exit 1 }
            in_frontmatter && $0 == "---" {
                in_frontmatter = 0
                found_end = 1
                print
                next
            }
            in_frontmatter && index($0, "status:") == 1 {
                found_status = 1
                print "status: " state
                next
            }
            in_frontmatter && index($0, "updated_at:") == 1 {
                found_updated_at = 1
                print "updated_at: " updated_at
                next
            }
            in_frontmatter && remove_closed_fields &&
                (index($0, "close_reason:") == 1 || index($0, "duplicate_of:") == 1) {
                next
            }
            { print }
            END {
                if (!found_end || !found_status || !found_updated_at) {
                    exit 1
                }
            }
        ' "$_ticket_rewrite_file" > "$_ticket_rewrite_tmp"
    then
        rm -f "$_ticket_rewrite_tmp"
        _ticket_error "ticket lifecycle fields are not writable: $_ticket_rewrite_file"
        return 1
    fi

    if ! mv "$_ticket_rewrite_tmp" "$_ticket_rewrite_file"; then
        rm -f "$_ticket_rewrite_tmp"
        _ticket_error "failed to update ticket file: $_ticket_rewrite_file"
        return 1
    fi
}

ticket_slugify_title() {
    [ "$#" -eq 1 ] || _ticket_error "ticket_slugify_title expects 1 argument" || return 1

    _ticket_slugify_slug=$(
        awk -v value="$1" '
            BEGIN {
                value = tolower(value)
                gsub(/[^abcdefghijklmnopqrstuvwxyz0123456789]+/, "-", value)
                gsub(/^-+/, "", value)
                gsub(/-+$/, "", value)
                print value
            }
        '
    )

    [ -n "$_ticket_slugify_slug" ] ||
        _ticket_error "ticket title cannot be slugified: $1" ||
        return 1

    printf '%s\n' "$_ticket_slugify_slug"
}

ticket_id_from_name() {
    [ "$#" -eq 1 ] || _ticket_error "ticket_id_from_name expects 1 argument" || return 1

    _ticket_id_name=$(basename "$1")
    _ticket_id_name=${_ticket_id_name%.md}

    case "$_ticket_id_name" in
        *-*) _ticket_id_value=${_ticket_id_name%%-*} ;;
        *)
            _ticket_error "ticket name must start with id: $1"
            return 1
            ;;
    esac

    case "$_ticket_id_value" in
        ''|*[!0123456789]*)
            _ticket_error "invalid ticket id in name: $1"
            return 1
            ;;
    esac

    case "$_ticket_id_value" in
        *[123456789]*) ;;
        *)
            _ticket_error "ticket id must be positive in name: $1"
            return 1
            ;;
    esac

    printf '%s\n' "$_ticket_id_value"
}

ticket_slug_from_name() {
    [ "$#" -eq 1 ] || _ticket_error "ticket_slug_from_name expects 1 argument" || return 1

    _ticket_slug_name=$(basename "$1")
    _ticket_slug_name=${_ticket_slug_name%.md}

    case "$_ticket_slug_name" in
        *-*) _ticket_slug_value=${_ticket_slug_name#*-} ;;
        *)
            _ticket_error "ticket name must include slug: $1"
            return 1
            ;;
    esac

    [ -n "$_ticket_slug_value" ] ||
        _ticket_error "ticket slug must not be empty in name: $1" ||
        return 1

    printf '%s\n' "$_ticket_slug_value"
}

ticket_resolve_reference() {
    [ "$#" -eq 2 ] || _ticket_error "ticket_resolve_reference expects 2 arguments" || return 1

    _ticket_resolve_project=$1
    _ticket_resolve_reference=$2

    [ -n "$_ticket_resolve_reference" ] ||
        _ticket_error "ticket reference must not be empty" ||
        return 1

    case "$_ticket_resolve_reference" in
        */*) _ticket_existing_path_reference "$_ticket_resolve_project" "$_ticket_resolve_reference"; return $? ;;
    esac

    if _ticket_resolve_id=$(_ticket_normalize_id "$_ticket_resolve_reference" 2>/dev/null); then
        _ticket_search_reference "$_ticket_resolve_project" id "$_ticket_resolve_id" "$_ticket_resolve_reference"
        return $?
    fi

    if ticket_id_from_name "$_ticket_resolve_reference" >/dev/null 2>&1 &&
        ticket_slug_from_name "$_ticket_resolve_reference" >/dev/null 2>&1
    then
        _ticket_resolve_name=$(basename "$_ticket_resolve_reference")
        case "$_ticket_resolve_name" in
            *.md) ;;
            *) _ticket_resolve_name=$_ticket_resolve_name.md ;;
        esac

        _ticket_search_reference "$_ticket_resolve_project" name "$_ticket_resolve_name" "$_ticket_resolve_reference"
        return $?
    fi

    _ticket_resolve_slug=$(ticket_slugify_title "$_ticket_resolve_reference") || return 1
    _ticket_search_reference "$_ticket_resolve_project" slug "$_ticket_resolve_slug" "$_ticket_resolve_reference"
}

ticket_is_state() {
    [ "$#" -eq 2 ] || _ticket_error "ticket_is_state expects 2 arguments" || return 1

    _ticket_is_state_file=$1
    _ticket_is_state_expected=$2

    _ticket_valid_state "$_ticket_is_state_expected" || return 1
    [ -f "$_ticket_is_state_file" ] || return 1

    _ticket_is_state_dir=$(basename "$(dirname "$_ticket_is_state_file")")
    [ "$_ticket_is_state_dir" = "$_ticket_is_state_expected" ] || return 1

    _ticket_is_state_actual=$(_ticket_frontmatter_value "$_ticket_is_state_file" status) || return 1
    [ "$_ticket_is_state_actual" = "$_ticket_is_state_expected" ]
}

_ticket_line_exists() {
    _ticket_line_exists_file=$1
    _ticket_line_exists_value=$2

    [ -f "$_ticket_line_exists_file" ] || return 1

    while IFS= read -r _ticket_line_exists_line ||
        [ -n "$_ticket_line_exists_line" ]; do
        [ "$_ticket_line_exists_line" = "$_ticket_line_exists_value" ] && return 0
    done < "$_ticket_line_exists_file"

    return 1
}

_ticket_append_unique_line() {
    _ticket_append_unique_file=$1
    _ticket_append_unique_value=$2

    _ticket_line_exists "$_ticket_append_unique_file" "$_ticket_append_unique_value" ||
        printf '%s\n' "$_ticket_append_unique_value" >> "$_ticket_append_unique_file"
}

ticket_closed_is_satisfied() {
    [ "$#" -eq 3 ] || _ticket_error "ticket_closed_is_satisfied expects 3 arguments" || return 2

    _ticket_satisfied_project=$1
    _ticket_satisfied_reference=$2
    _ticket_satisfied_visited=$3

    while :; do
        _ticket_satisfied_path=$(
            ticket_resolve_reference "$_ticket_satisfied_project" "$_ticket_satisfied_reference"
        ) || return 2
        _ticket_satisfied_file=$_ticket_satisfied_project/$_ticket_satisfied_path

        if _ticket_line_exists "$_ticket_satisfied_visited" "$_ticket_satisfied_path"; then
            _ticket_error "duplicate dependency cycle: $_ticket_satisfied_path"
            return 2
        fi
        _ticket_append_unique_line "$_ticket_satisfied_visited" "$_ticket_satisfied_path" ||
            return 2

        ticket_validate_file "$_ticket_satisfied_project" "$_ticket_satisfied_file" ||
            return 2

        if ! ticket_is_state "$_ticket_satisfied_file" closed; then
            return 1
        fi

        _ticket_satisfied_reason=$(
            _ticket_frontmatter_value "$_ticket_satisfied_file" close_reason
        ) || _ticket_error "closed tickets must have close_reason" || return 2

        case "$_ticket_satisfied_reason" in
            done)
                return 0
                ;;
            duplicate)
                _ticket_satisfied_reference=$(
                    _ticket_frontmatter_value "$_ticket_satisfied_file" duplicate_of
                ) || _ticket_error "duplicate tickets must have duplicate_of" || return 2
                ;;
            *)
                return 1
                ;;
        esac
    done
}

ticket_collect_files() {
    [ "$#" -eq 3 ] || _ticket_error "ticket_collect_files expects 3 arguments" || return 1

    _ticket_collect_project=$1
    _ticket_collect_output=$2
    _ticket_collect_tmp_dir=$3
    _ticket_collect_unsorted=$_ticket_collect_tmp_dir/ticket-files-unsorted

    : > "$_ticket_collect_unsorted"

    for _ticket_collect_state in open active closed; do
        _ticket_collect_dir=$_ticket_collect_project/.coderail/tickets/$_ticket_collect_state

        [ -d "$_ticket_collect_dir" ] || continue

        for _ticket_collect_file in "$_ticket_collect_dir"/*.md; do
            [ -f "$_ticket_collect_file" ] || continue

            _ticket_collect_base=$(basename "$_ticket_collect_file")
            printf '.coderail/tickets/%s/%s\n' \
                "$_ticket_collect_state" \
                "$_ticket_collect_base" >> "$_ticket_collect_unsorted"
        done
    done

    sort "$_ticket_collect_unsorted" > "$_ticket_collect_output"
}

ticket_readiness_is_resolved() {
    [ "$#" -eq 3 ] || _ticket_error "ticket_readiness_is_resolved expects 3 arguments" || return 1

    _ticket_readiness_project=$1
    _ticket_readiness_path=$2
    _ticket_readiness_visited=$3
    _ticket_readiness_file=$_ticket_readiness_project/$_ticket_readiness_path

    if _ticket_line_exists "$_ticket_readiness_visited" "$_ticket_readiness_path"; then
        _ticket_error "duplicate ticket cycle: $_ticket_readiness_path"
        return 1
    fi
    _ticket_append_unique_line "$_ticket_readiness_visited" "$_ticket_readiness_path"

    _ticket_readiness_status=$(
        _ticket_frontmatter_value "$_ticket_readiness_file" status
    ) || _ticket_error "missing ticket field: status" || return 1

    case "$_ticket_readiness_status" in
        open|active)
            _ticket_error "$_ticket_readiness_status tickets are not resolved: $_ticket_readiness_path"
            return 1
            ;;
        closed)
            ;;
        *)
            _ticket_error "invalid ticket status: $_ticket_readiness_status"
            return 1
            ;;
    esac

    _ticket_readiness_reason=$(
        _ticket_frontmatter_value "$_ticket_readiness_file" close_reason
    ) || _ticket_error "closed tickets must have close_reason" || return 1

    case "$_ticket_readiness_reason" in
        done)
            return 0
            ;;
        duplicate)
            _ticket_readiness_duplicate_of=$(
                _ticket_frontmatter_value "$_ticket_readiness_file" duplicate_of
            ) || _ticket_error "duplicate tickets must have duplicate_of" || return 1
            _ticket_readiness_target_path=$(
                ticket_resolve_reference \
                    "$_ticket_readiness_project" \
                    "$_ticket_readiness_duplicate_of"
            ) || return 1
            _ticket_readiness_target_file=$_ticket_readiness_project/$_ticket_readiness_target_path

            ticket_validate_file \
                "$_ticket_readiness_project" \
                "$_ticket_readiness_target_file" || return 1

            if ! ticket_is_state "$_ticket_readiness_target_file" closed; then
                _ticket_error "duplicate target is not closed: $_ticket_readiness_target_path"
                return 1
            fi

            ticket_readiness_is_resolved \
                "$_ticket_readiness_project" \
                "$_ticket_readiness_target_path" \
                "$_ticket_readiness_visited"
            ;;
        *)
            _ticket_error "closed ticket is not resolved: $_ticket_readiness_path"
            return 1
            ;;
    esac
}

ticket_validate_all_resolved() {
    [ "$#" -eq 3 ] || _ticket_error "ticket_validate_all_resolved expects 3 arguments" || return 1

    _ticket_validate_all_project=$1
    _ticket_validate_all_files=$2
    _ticket_validate_all_tmp_dir=$3

    [ -s "$_ticket_validate_all_files" ] || return 0

    while IFS= read -r _ticket_validate_all_path ||
        [ -n "$_ticket_validate_all_path" ]; do
        [ -n "$_ticket_validate_all_path" ] || continue

        ticket_validate_file \
            "$_ticket_validate_all_project" \
            "$_ticket_validate_all_project/$_ticket_validate_all_path" || return 1
    done < "$_ticket_validate_all_files"

    while IFS= read -r _ticket_validate_all_path ||
        [ -n "$_ticket_validate_all_path" ]; do
        [ -n "$_ticket_validate_all_path" ] || continue

        _ticket_validate_all_visited=$(mktemp "$_ticket_validate_all_tmp_dir/readiness.XXXXXX") ||
            _ticket_error "failed to create ticket readiness state" || return 1
        ticket_readiness_is_resolved \
            "$_ticket_validate_all_project" \
            "$_ticket_validate_all_path" \
            "$_ticket_validate_all_visited" || return 1
    done < "$_ticket_validate_all_files"
}

ticket_move_to_state() {
    [ "$#" -eq 3 ] || _ticket_error "ticket_move_to_state expects 3 arguments" || return 1

    _ticket_move_project=$1
    _ticket_move_file=$2
    _ticket_move_state=$3

    _ticket_valid_state "$_ticket_move_state" ||
        _ticket_error "invalid ticket state: $_ticket_move_state" ||
        return 1

    [ -f "$_ticket_move_file" ] ||
        _ticket_error "ticket file not found: $_ticket_move_file" ||
        return 1

    _ticket_move_base=$(basename "$_ticket_move_file")
    case "$_ticket_move_base" in
        *.md) ;;
        *) _ticket_error "ticket file must have .md extension: $_ticket_move_file" || return 1 ;;
    esac

    _ticket_require_frontmatter_key "$_ticket_move_file" status || return 1
    _ticket_require_frontmatter_key "$_ticket_move_file" updated_at || return 1

    _ticket_move_target_rel=.coderail/tickets/$_ticket_move_state/$_ticket_move_base
    _ticket_move_target_dir=$_ticket_move_project/.coderail/tickets/$_ticket_move_state
    _ticket_move_target=$_ticket_move_project/$_ticket_move_target_rel

    mkdir -p "$_ticket_move_target_dir" ||
        _ticket_error "failed to create ticket state directory: $_ticket_move_target_dir" ||
        return 1

    _ticket_move_source_path=$(_ticket_file_path "$_ticket_move_file") || return 1
    _ticket_move_target_path=$(_ticket_file_path "$_ticket_move_target") || return 1

    if [ -e "$_ticket_move_target" ] && [ "$_ticket_move_source_path" != "$_ticket_move_target_path" ]; then
        _ticket_error "target ticket already exists: $_ticket_move_target_rel"
        return 1
    fi

    _ticket_move_updated_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    _ticket_rewrite_lifecycle "$_ticket_move_file" "$_ticket_move_state" "$_ticket_move_updated_at" ||
        return 1

    if [ "$_ticket_move_source_path" != "$_ticket_move_target_path" ]; then
        mv "$_ticket_move_file" "$_ticket_move_target" ||
            _ticket_error "failed to move ticket to $_ticket_move_target_rel" ||
            return 1
    fi

    printf '%s\n' "$_ticket_move_target_rel"
}

ticket_validate_file() {
    [ "$#" -eq 2 ] || _ticket_error "ticket_validate_file expects 2 arguments" || return 1

    _ticket_validate_project=$1
    _ticket_validate_file=$2

    [ -f "$_ticket_validate_file" ] ||
        _ticket_error "ticket file not found: $_ticket_validate_file" ||
        return 1

    _ticket_has_frontmatter "$_ticket_validate_file" ||
        _ticket_error "ticket frontmatter is missing or unterminated: $_ticket_validate_file" ||
        return 1

    _ticket_validate_id=$(_ticket_frontmatter_value "$_ticket_validate_file" id) ||
        _ticket_error "missing ticket field: id" ||
        return 1
    _ticket_validate_slug=$(_ticket_frontmatter_value "$_ticket_validate_file" slug) ||
        _ticket_error "missing ticket field: slug" ||
        return 1
    _ticket_validate_title=$(_ticket_frontmatter_value "$_ticket_validate_file" title) ||
        _ticket_error "missing ticket field: title" ||
        return 1
    _ticket_validate_status=$(_ticket_frontmatter_value "$_ticket_validate_file" status) ||
        _ticket_error "missing ticket field: status" ||
        return 1
    _ticket_validate_created_at=$(_ticket_frontmatter_value "$_ticket_validate_file" created_at) ||
        _ticket_error "missing ticket field: created_at" ||
        return 1
    _ticket_validate_updated_at=$(_ticket_frontmatter_value "$_ticket_validate_file" updated_at) ||
        _ticket_error "missing ticket field: updated_at" ||
        return 1
    _ticket_require_frontmatter_key "$_ticket_validate_file" dependencies || return 1

    case "$_ticket_validate_id" in
        ''|*[!0123456789]*)
            _ticket_error "invalid ticket id: $_ticket_validate_id"
            return 1
            ;;
    esac

    [ "${#_ticket_validate_id}" -ge 4 ] ||
        _ticket_error "ticket id must have at least 4 digits: $_ticket_validate_id" ||
        return 1

    case "$_ticket_validate_id" in
        *[123456789]*) ;;
        *)
            _ticket_error "ticket id must be positive: $_ticket_validate_id"
            return 1
            ;;
    esac

    [ "$_ticket_validate_title" ] ||
        _ticket_error "ticket title must not be empty" ||
        return 1
    [ "$_ticket_validate_slug" ] ||
        _ticket_error "ticket slug must not be empty" ||
        return 1
    [ "$_ticket_validate_created_at" ] ||
        _ticket_error "ticket created_at must not be empty" ||
        return 1
    [ "$_ticket_validate_updated_at" ] ||
        _ticket_error "ticket updated_at must not be empty" ||
        return 1

    _ticket_valid_state "$_ticket_validate_status" ||
        _ticket_error "invalid ticket status: $_ticket_validate_status" ||
        return 1

    _ticket_validate_base=$(basename "$_ticket_validate_file")
    _ticket_validate_expected_base=$_ticket_validate_id-$_ticket_validate_slug.md
    [ "$_ticket_validate_base" = "$_ticket_validate_expected_base" ] ||
        _ticket_error "ticket filename must match id and slug: $_ticket_validate_expected_base" ||
        return 1

    _ticket_validate_project_path=$(_ticket_project_dir "$_ticket_validate_project") || return 1
    _ticket_validate_file_dir=$(_ticket_file_dir "$_ticket_validate_file") || return 1
    _ticket_validate_expected_dir=$_ticket_validate_project_path/.coderail/tickets/$_ticket_validate_status
    [ "$_ticket_validate_file_dir" = "$_ticket_validate_expected_dir" ] ||
        _ticket_error "ticket path does not match status: $_ticket_validate_status" ||
        return 1

    _ticket_validate_has_close_reason=false
    _ticket_validate_close_reason=
    if _ticket_has_frontmatter_key "$_ticket_validate_file" close_reason; then
        _ticket_validate_has_close_reason=true
        _ticket_validate_close_reason=$(_ticket_frontmatter_value "$_ticket_validate_file" close_reason)
    fi

    _ticket_validate_has_duplicate_of=false
    _ticket_validate_duplicate_of=
    if _ticket_has_frontmatter_key "$_ticket_validate_file" duplicate_of; then
        _ticket_validate_has_duplicate_of=true
        _ticket_validate_duplicate_of=$(_ticket_frontmatter_value "$_ticket_validate_file" duplicate_of)
    fi

    case "$_ticket_validate_status" in
        open|active)
            [ "$_ticket_validate_has_close_reason" = false ] ||
                _ticket_error "open and active tickets must not have close_reason" ||
                return 1
            [ "$_ticket_validate_has_duplicate_of" = false ] ||
                _ticket_error "open and active tickets must not have duplicate_of" ||
                return 1
            ;;
        closed)
            [ "$_ticket_validate_has_close_reason" = true ] ||
                _ticket_error "closed tickets must have close_reason" ||
                return 1

            case "$_ticket_validate_close_reason" in
                done|duplicate|deferred|dismissed) ;;
                *)
                    _ticket_error "invalid close reason: $_ticket_validate_close_reason"
                    return 1
                    ;;
            esac

            if [ "$_ticket_validate_close_reason" = duplicate ]; then
                [ "$_ticket_validate_has_duplicate_of" = true ] ||
                    _ticket_error "duplicate tickets must have duplicate_of" ||
                    return 1
                [ "$_ticket_validate_duplicate_of" ] ||
                    _ticket_error "duplicate_of must not be empty" ||
                    return 1
            else
                [ "$_ticket_validate_has_duplicate_of" = false ] ||
                    _ticket_error "duplicate_of is only valid for duplicate tickets" ||
                    return 1
            fi
            ;;
    esac
}
