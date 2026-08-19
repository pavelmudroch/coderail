#!/usr/bin/env sh

# load and intialize configuration from config files and environment variables
load_config()
{
    local_config_file="$(pwd)/.coderail/coderail.conf"
    global_config_file="$ROOT_DIR/.coderail/coderail.conf"
    printf 'Loading configuration:\nPrecedence:\n1. global: %s\n2. local: %s\n3. Environment Variables\n4. Command-line Arguments\n' "$global_config_file" "$local_config_file" >&2

    # log level
    # ENV-VAR: LOG_LEVEL=verbose|quiet

    # log color
    [ -z "${NO_COLOR:-}" ] || log_color=0

    # log interactive
    [ -z "${NON_INTERACTIVE:-}" ] || log_interactive=0

    # parse global flags
}