---
name: windows-wsl
description: Lessons for agents running on Windows against a repo or tools in WSL. Use when the session runs on Windows, calls `wsl`, edits files under `\\wsl.localhost\`, or hits shell quoting, path or line-ending problems.
---

# Windows + WSL: lessons

- Call WSL from Bash (Git Bash), not PowerShell, and batch each step into one `wsl -e bash -ic '…'` (`-ic` loads nvm). Why: PowerShell→wsl calls failed 16% of the time, against 3% from Bash, mostly on quoting. Source: pesitro retro 2026-10-21.
- Hand the human every command in PowerShell syntax unless they said their terminal is another shell. Why: a bash `for … do … done` loop given for a manual step failed to parse in their PowerShell terminal. Source: Servisnik#42 (charter 2026-10-21).
- Write multi-line content (issue bodies, scripts) to files with the Write tool and pass them by path (`--body-file`, `bash script.sh`), not as heredocs inside one long Bash command. Why: a 137-line command with heredocs and non-ASCII quotes died on a quote parse error before creating anything. Source: Servisnik#42 (charter 2026-10-21).
- Read a file with the Read tool before editing it with Edit, using the same path form. Why: reading through `wsl cat` and then editing the UNC path caused 251 failed edits. Source: pesitro retro 2026-10-21.
- After Edit or Write on a `\\wsl.localhost\` path, check `git diff --summary` for mode changes (100755 → 100644) and grep TypeScript for `\uXXXX` escapes turned into literal characters (BOM, non-breaking space). Source: pesitro#218.
- Run `gh` from Windows with `--repo owner/name`; it is not installed in WSL. Source: pesitro retro 2026-10-21.
- `python` on Windows may be the Microsoft Store stub; call a real interpreter by full path. MSYS mangles `/paths` passed to native tools; set `MSYS_NO_PATHCONV=1` for that call. Source: pesitro retro 2026-10-21.
- Commit `.gitattributes` with `* text=auto eol=lf` before the first generated file. Source: pesitro.
- Normalize both sides with `cygpath -u` before comparing a path from a Claude tool payload with one from git. Why: Git for Windows prints `C:/Work/…` and the hook payload carries `C:\Work\…`, so an "is this file in the repo" check never matched. Source: Servisnik#85.
- Delete an agent worktree that holds `node_modules` with `cmd /c 'rd /s /q "\\?\<absolute path>"'` (literal path, no variables), and confirm with `Test-Path` afterwards. Why: `git worktree remove` failed with "Filename too long" on pnpm's deep paths, unregistered the worktree anyway and left half-deleted directories. Source: Servisnik run 2026-10-26.
