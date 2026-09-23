#!/usr/bin/env sh

path_is_absolute()
{
    path="$1"
    case "$path" in
        /*) return 0 ;;
        *) return 1 ;;
    esac
}

path_is_within()
{
    root="$1"
    path="$2"

    [ "$path" = "$root" ] && return 0

    case "$path" in
        "$root"/*)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

path_normalize_relative()
{
    path="$1"

    case $path in
        '')  return 1 ;;
        /*)  return 1 ;;
    esac

    CR_NORMALIZE_PATH=$path awk '
        BEGIN {
            path = ENVIRON["CR_NORMALIZE_PATH"]
            n = split(path, parts, "/")
            depth = 0

            for (i = 1; i <= n; i++) {
                part = parts[i]

                if (part == "" || part == ".")
                    continue

                if (part == "..") {
                    if (depth == 0)
                        exit 1

                    depth--
                    continue
                }

                stack[++depth] = part
            }

            if (depth == 0) {
                print "."
                exit
            }

            result = stack[1]
            for (i = 2; i <= depth; i++)
                result = result "/" stack[i]

            print result
        }
    '
}

path_checksum()
{
    [ "$#" -eq 1 ] || return 1

    file="$1"
    [ -f "$file" ] && [ ! -L "$file" ] && [ -r "$file" ] || return 1

    checksum_result=$(cksum 2>/dev/null < "$file") || return 1
    case "$checksum_result" in
        *' '*)
            checksum=${checksum_result%% *}
            byte_length=${checksum_result#* }
            ;;
        *)
            return 1
            ;;
    esac

    case "$checksum" in
        ''|*[!0-9]*) return 1 ;;
    esac
    case "$byte_length" in
        ''|*' '*|*[!0-9]*) return 1 ;;
    esac

    printf '%s %s\n' "$checksum" "$byte_length"
}

path_manifest_relative()
{
    [ "$#" -eq 1 ] || return 1

    path="$1"
    manifest_tab=$(printf '\t')
    manifest_newline='
'
    case "$path" in
        ''|/*|*/|*//*|.|..|./*|../*|*/.|*/..|*/./*|*/../*|*"$manifest_tab"*|*"$manifest_newline"*)
            return 1
            ;;
    esac

    case "$path" in
        bin/*|lib/*|instructions/*|templates/*)
            ;;
        *)
            return 1
            ;;
    esac

    printf '%s\n' "$path"
}

path_manifest_target()
{
    [ "$#" -eq 2 ] || return 1

    root="$1"
    relative_path="$2"
    manifest_tab=$(printf '\t')
    manifest_newline='
'
    case "$root" in
        /*)
            ;;
        *)
            return 1
            ;;
    esac
    case "$root" in
        *//*|*/.|*/..|*/./*|*/../*|*"$manifest_tab"*|*"$manifest_newline"*)
            return 1
            ;;
    esac

    while [ "$root" != / ] && [ "${root%/}" != "$root" ]; do
        root=${root%/}
    done

    relative_path=$(path_manifest_relative "$relative_path") || return 1
    if [ "$root" = / ]; then
        printf '/%s\n' "$relative_path"
    else
        printf '%s/%s\n' "$root" "$relative_path"
    fi
}

path_locate_executable()
{
    executable="$1"
    if ! executable="$(command -v "$executable" 2>/dev/null)"; then
        return 1
    fi

    while [ -L "$executable" ]; do
        exec_dir=$(
            CDPATH= cd -- "$(dirname "$executable")"
            pwd
        )
        link_target=$(readlink "$executable")

        case "$link_target" in
            /*) executable="$link_target" ;;
            *) executable="$exec_dir/$link_target" ;;
        esac
    done

    printf '%s\n' "$executable"
}
