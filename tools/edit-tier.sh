#!/usr/bin/env bash
# Edit tier of verify (AGENTS.md), run as a PostToolUse hook after Edit/Write.
# Typechecks only when the edited file is TypeScript or JSON inside this repo;
# exit 2 hands the errors back to the agent.
f=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).tool_input?.file_path??"")}catch{console.log("")}})')
case "$f" in *.ts | *.tsx | *.mts | *.cts | *.json) ;; *) exit 0 ;; esac
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
# Git for Windows prints C:/..., Claude passes C:\...: compare both as /c/...
root=$(cygpath -u "$root" 2>/dev/null || printf '%s' "$root")
f=$(cygpath -u "$f" 2>/dev/null || printf '%s' "$f")
[[ ${f,,} == "${root,,}"/* ]] || exit 0
if ! command -v pnpm >/dev/null; then
  echo "Edit tier skipped: pnpm is not installed. Install it (PowerShell): npm install -g pnpm@12.14.0 --registry=https://registry.yarnpkg.com" >&2
  exit 2
fi
cd "$root" && pnpm -s typecheck 1>&2 || exit 2
