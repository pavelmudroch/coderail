#!/usr/bin/env sh

cr=./bin/cr
$cr --help

find ./lib/commands -type f -name '*.sh' |
while IFS= read -r line; do
    commands="${line##./lib/commands/}"
    command="${commands%%/*}"
    command="${command%%.sh}"
    subcommand="${commands##*/}"
    subcommand="${subcommand%%.sh}"
    if [ "$command" = "$subcommand" ]; then
        subcommand=""
    fi

    if [ "$subcommand" = "internal_install" ]; then
        continue
    fi

    if [ -z "$subcommand" ]; then
        $cr "$command" --help
    else
        $cr "$command" "$subcommand" --help
    fi
done
