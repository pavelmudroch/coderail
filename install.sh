#!/usr/bin/env sh
set -eu

API=https://api.github.com/repos/pavelmudroch/coderail
log() { printf 'install: %s\n' "$*"; }
fail() { echo "install: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || fail "Required tool not found: $1"; }

root=${CODERAIL_INSTALL_ROOT:-"${HOME:?HOME is required}/.coderail"}
need mkdir
mkdir -p "$root"
root=$(CDPATH= cd -P "$root" && pwd) || fail 'Cannot access installation root'
log "Installing Coderail into $root"

# Only delegate to a launcher that actually belongs to the selected root.
launcher=$root/bin/cr
if [ -L "$launcher" ]; then
    target=$(readlink "$launcher") || target=
    case $target in
        /*) ;;
        *) target=$root/bin/$target ;;
    esac
    target_dir=$(CDPATH= cd -P "$(dirname "$target")" 2>/dev/null && pwd) || target_dir=
    if [ "$target_dir" = "$root/libexec" ] && [ ! -L "$target" ] && [ -x "$launcher" ]; then
        if health=$("$launcher" --version 2>/dev/null); then
            case $health in
                'Coderail version '*)
                    log 'Updating existing installation to the latest stable release...'
                    "$launcher" "$@" upgrade --version latest
                    log "Installation complete: $launcher"
                    exit 0
                    ;;
            esac
        fi
    fi
fi

for tool in uname jq unzip mktemp chmod rm dirname basename readlink cmp; do need "$tool"; done
if command -v curl >/dev/null 2>&1; then
    download() { curl -fsSL -H "Accept: $1" "$2"; }
elif command -v wget >/dev/null 2>&1; then
    download() { wget -qO- --header="Accept: $1" "$2"; }
else
    fail 'Required download tool not found (curl or wget)'
fi
if command -v sha256sum >/dev/null 2>&1; then
    hash_tool=sha256sum
elif command -v shasum >/dev/null 2>&1; then
    hash_tool=shasum
else
    fail 'Required SHA-256 tool not found (sha256sum or shasum)'
fi
case $(uname -s) in
    Linux) os=unknown-linux-gnu ;;
    Darwin) os=apple-darwin ;;
    *) fail 'Unsupported operating system' ;;
esac
case $(uname -m) in
    x86_64|amd64) arch=x86_64 ;;
    arm64|aarch64) arch=aarch64 ;;
    *) fail 'Unsupported architecture' ;;
esac
name=coderail-$arch-$os.zip
tmp=$(mktemp -d "${TMPDIR:-/tmp}/coderail-install.XXXXXXXX") || fail 'Cannot create temporary directory'
bootstrap=
cleanup() {
    if [ -n "$bootstrap" ] && [ -f "$bootstrap" ]; then
        # Activation may have made this executable active or recorded ownership.
        active=$(readlink "$launcher" 2>/dev/null || :)
        case $active in
            /*) ;;
            '') ;;
            *) active=$root/bin/$active ;;
        esac
        if [ -n "$active" ]; then
            active_dir=$(CDPATH= cd -P "$(dirname "$active")" 2>/dev/null && pwd) || active_dir=
            [ -z "$active_dir" ] || active=$active_dir/$(basename "$active")
        fi
        owned=false
        if [ -f "$root/.coderail-distribution.json" ]; then
            if jq -e --arg path "libexec/$(basename "$bootstrap")" '.files | any(.path == $path)' "$root/.coderail-distribution.json" >/dev/null 2>&1; then owned=true; fi
        fi
        if [ "$active" != "$bootstrap" ] && [ "$owned" = false ]; then rm -f "$bootstrap"; fi
    fi
    rm -rf "$tmp"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
log 'Resolving the latest stable release...'
download 'application/vnd.github+json' "$API/releases/latest" > "$tmp/release" || fail 'Could not resolve latest release'
identity=$(jq -er '
    select(.draft == false and .prerelease == false and (.id | type == "number" and . > 0 and floor == .) and
      (.tag_name | type == "string" and test("^v?(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$")) and
      (.target_commitish | type == "string" and test("^[0-9a-f]{40}$")) and (.updated_at | type == "string")) |
    "\(.id) \(.tag_name)"' "$tmp/release") || fail 'Invalid latest stable release'
id=${identity%% *}
tag=${identity#* }
version=${tag#v}
log "Selected Coderail $version; fetching release asset details..."
download 'application/vnd.github+json' "$API/releases/$id/assets?per_page=100" > "$tmp/assets" || fail 'Could not list release assets'
asset_id() {
    jq -er --arg name "$1" '[.[] | select(.name == $name and .state == "uploaded" and (.id | type == "number" and . > 0 and floor == .))] | select(length == 1) | .[0].id' "$tmp/assets"
}
archive_id=$(asset_id "$name") || fail "Missing or invalid release asset: $name"
checksum_id=$(asset_id "$name.sha256") || fail "Missing or invalid release asset: $name.sha256"
log "Downloading $name..."
download 'application/octet-stream' "$API/releases/assets/$archive_id" > "$tmp/archive" || fail 'Archive download failed'
log 'Downloading and verifying the SHA-256 checksum...'
download 'application/octet-stream' "$API/releases/assets/$checksum_id" > "$tmp/checksum" || fail 'Checksum download failed'
if [ "$hash_tool" = sha256sum ]; then digest=$(sha256sum "$tmp/archive"); else digest=$(shasum -a 256 "$tmp/archive"); fi
digest=${digest%% *}
printf '%s  %s\n' "$digest" "$name" > "$tmp/expected"
cmp -s "$tmp/checksum" "$tmp/expected" || fail 'Archive SHA-256 mismatch'
mkdir -p "$root/libexec"
[ ! -L "$root/libexec" ] || fail 'Unsafe executable directory'
bootstrap=$(mktemp "$root/libexec/cr-bootstrap.XXXXXXXX") || fail 'Cannot create bootstrap executable'
log 'Extracting the bootstrap executable...'
unzip -p "$tmp/archive" cr > "$bootstrap" || fail 'Could not extract bootstrap executable'
chmod 755 "$bootstrap"
log "Installing Coderail $version..."
"$bootstrap" "$@" upgrade --version "$version"
[ -x "$launcher" ] || fail "Bootstrap exited successfully without installing $launcher; release $tag may need an installer compatibility fix"
log "Installation complete: $launcher"
