---
"ado-preflight-ui": patch
---

Fixed a React crash on Satellite Client Tools / Satellite Config when `component_config.satellite` was missing (`validate_certs` on undefined). The form now hydrates satellite defaults when those options are selected.
