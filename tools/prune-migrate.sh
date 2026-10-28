#!/bin/sh
# Dockerfile, stage `migrate`: `sh tools/prune-migrate.sh node_modules/.pnpm` deletes from a pnpm store what a production
# install of apps/web carries for Next.js (300 MB) and migrating and seeding do not use. A pattern that matches
# nothing fails the build, naming it: pnpm renamed its entries or Next.js dropped a dependency, and the image
# would otherwise grow without a sign.
set -eu
cd "$1"
for entry in next@* @next+swc-* @img+* sharp@*; do
  if [ ! -e "$entry" ]; then
    echo "prune-migrate: nothing in $PWD matches $entry" >&2
    exit 1
  fi
  rm -rf "$entry"
done
