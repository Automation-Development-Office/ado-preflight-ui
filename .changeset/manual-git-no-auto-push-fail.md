---
"ado-preflight-ui": patch
---

When Automatically commit and push is unchecked, pass pause_after_generate=false and rely on manual git_mode so bootstrap no longer fails on an unwanted git push.
