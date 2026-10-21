---
name: windows-wsl
description: Lessons for agents running on Windows against a repo or tools in WSL. Use when the session runs on Windows, calls `wsl`, edits files under `\\wsl.localhost\`, or hits shell quoting, path or line-ending problems.
---

# Windows + WSL: lessons

- Call WSL from Bash (Git Bash), not PowerShell, and batch each step into one `wsl -e bash -ic '…'` (`-ic` loads nvm). Why: PowerShell→wsl calls failed 16% of the time, against 3% from Bash, mostly on quoting. Source: pesitro retro 2026-10-21.
- Read a file with the Read tool before editing it with Edit, using the same path form. Why: reading through `wsl cat` and then editing the UNC path caused 251 failed edits. Source: pesitro retro 2026-10-21.
- After Edit or Write on a `\\wsl.localhost\` path, check `git diff --summary` for mode changes (100755 → 100644) and grep TypeScript for `\uXXXX` escapes turned into literal characters (BOM, non-breaking space). Source: pesitro#218.
- Run `gh` from Windows with `--repo owner/name`; it is not installed in WSL. Source: pesitro retro 2026-10-21.
- `python` on Windows may be the Microsoft Store stub; call a real interpreter by full path. MSYS mangles `/paths` passed to native tools; set `MSYS_NO_PATHCONV=1` for that call. Source: pesitro retro 2026-10-21.
- Commit `.gitattributes` with `* text=auto eol=lf` before the first generated file. Source: pesitro.
