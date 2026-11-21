#!/usr/bin/env bash
# usage: new_project.sh <dir> [--theme <name>] [--format <f>]   -> scaffolds a reel project
# Kept for older instructions. It is the same as: reel new <dir> ...   Files that already exist in <dir> are kept.
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/engine/cli.mjs" new "$@"
