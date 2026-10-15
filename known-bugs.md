# Known bugs

Operational issues seen in the lab that are not always fixed yet. Click a title for the full write-up.

## Index

- [Hub large-collection publish timeout](#hub-large-collection-publish-timeout) —
  **Fixed in `infra.ado` 1.3.16+** (longer pulp waits; large tarballs get ~20m).
  Older preflight images may still hit the old ~3 min timeout.
- [Hub EE skopeo 502 during layer upload](#hub-ee-skopeo-502-during-layer-upload) —
  **Mitigated in `infra.ado` 1.3.16+** (skopeo + Ansible retries). Persistent
  gateway/proxy outages can still fail after retries.

---

## Hub large-collection publish timeout

**Status:** Fixed in collection (`bootstrap_controller` pulp wait knobs). Redeploy
preflight with a rebuilt `infra-ado-*.tar.gz` to pick it up.

**Where it showed up**

- Preflight component: **Hub update** / hub-only (`hub_update_collection_only`)
- Task: `Publish preflight collection | Resolve pulp href for collection version`
- Typical collection: `redhat.rhel_system_roles` (large tarball).

**What used to happen**

1. Upload to Hub staging succeeded.
2. Bootstrap polled pulp for ~3 minutes (`retries: 36`, `delay: 5`), then failed.
3. Hub EE push never ran because the play stopped in the collection publish loop.
4. The collection often appeared in pulp shortly after the timeout.

**Fix (code)**

- Default pulp wait ~10 minutes (`retries: 60`, `delay: 10`).
- Tarballs >= 30MB use ~20 minutes (`retries: 120`, `delay: 10`).
- Upload `timeout` / `request_timeout` raised for large artifacts.

**If you still see it**

1. Confirm preflight is running the rebuilt collection tarball (restart pod after copy).
2. Re-run the same Hub bootstrap — already-published collections skip; promote/EE can continue.
3. Optional override: raise `bootstrap_controller_hub_publish_large_verify_retries` in extra vars.

---

## Hub EE skopeo 502 during layer upload

**Status:** Mitigated (retries). Not a permanent Hub/route fix.

**Where it shows up**

- Task: `Hub EE | skopeo copy source to Hub registry`
- Symptom: `502 Bad Gateway` (or similar) while pushing layers to the Hub registry.

**Fix (code)**

- `skopeo copy --retry-times` / `--retry-delay` (defaults 8 / `15s`).
- Ansible-level retries (defaults 5 × 30s) that stop early on hard auth failures (401/403).

**If it still fails after retries**

- Check Hub/registry route and ingress; re-run Hub-only bootstrap (collections already published will skip).
