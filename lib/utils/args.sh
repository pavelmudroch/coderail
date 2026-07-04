#!/usr/bin/env sh

require_no_args() {
    [ "$#" -eq 0 ] || error "unexpected argument: $1"
}