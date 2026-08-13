# AAP Hub recovery and permanence (prod `aap` namespace)

## Root cause (historical)
Shared Postgres (`aap-postgres-15`) previously served Controller **and** Hub.
Hub API/web probes + gunicorn workers hammered `core_apiappstatus`, causing
LWLock storms, connection exhaustion, CrashLoopBackOff, and `/api/galaxy/` 503s.

Mitigations alone (1 worker, CronJob vacuum) reduced frequency but did **not**
eliminate shared-buffer contention.

## Permanent fix (applied)
Hub now uses a **dedicated PostgreSQL** instance:

| Resource | Name |
|----------|------|
| StatefulSet / Service | `aap-hub-dedicated-postgres` |
| PVC | `aap-hub-dedicated-postgres-data` (20Gi, `synology-nfs-csi`) |
| Admin secret | `aap-hub-dedicated-postgres-admin` |
| Hub DB secret | `external-hub-postgres-configuration` (`type: unmanaged`) |

`AutomationHub/aap-hub` and `AnsibleAutomationPlatform/aap` both reference:

```yaml
spec:
  hub:
    postgres_configuration_secret: external-hub-postgres-configuration
```

Controller continues on shared `aap-postgres-15`. Hub DB traffic no longer
competes for Controller Postgres connections or shared buffers.

## Operating posture (still required)
1. Hub replicas remain **1/1/1/1** (`api` / `content` / `worker` / `web`).
2. `gunicorn_api_workers: 1`, `gunicorn_content_workers: 1`, `gunicorn_timeout: 180`.
3. CronJob `aap-hub-stability` (every 15m) re-pins those settings and vacuums
   `core_apiappstatus` on **`aap-hub-dedicated-postgres-0`** (not shared PG).

## Verify
```bash
curl -sk -o /dev/null -w 'hub=%{http_code}\n' https://aap-hub-aap.apps.ocp.prod.rhlab/api/galaxy/
curl -sk -o /dev/null -w 'ctrl=%{http_code}\n' https://aap-aap.apps.ocp.prod.rhlab/api/controller/v2/ping/

# Hub sessions should be on dedicated PG, not shared:
oc -n aap exec aap-postgres-15-0 -- \
  psql -U postgres -tAc "SELECT count(*) FROM pg_stat_activity WHERE usename='automationhub';"
oc -n aap exec aap-hub-dedicated-postgres-0 -- \
  psql -U postgres -tAc "SELECT count(*) FROM pg_stat_activity WHERE usename='automationhub';"
```

## Emergency recovery (dedicated DB era)
If Hub is wedged again:

```bash
# 1) Stop Hub
oc -n aap patch ansibleautomationplatform aap --type=merge -p '{
  "spec":{"hub":{"api":{"replicas":0},"content":{"replicas":0},"worker":{"replicas":0},"web":{"replicas":0}}}
}'
oc -n aap scale deploy/aap-hub-api deploy/aap-hub-content deploy/aap-hub-worker deploy/aap-hub-web --replicas=0

# 2) Restart dedicated Hub Postgres (Controller stays up)
oc -n aap delete pod aap-hub-dedicated-postgres-0
oc -n aap wait --for=condition=Ready pod/aap-hub-dedicated-postgres-0 --timeout=300s

# 3) Vacuum Hub status table
oc -n aap exec aap-hub-dedicated-postgres-0 -- bash -lc \
  "psql -U postgres -d automationhub -c 'VACUUM public.core_apiappstatus;'"

# 4) Bring Hub back
oc -n aap patch ansibleautomationplatform aap --type=merge -p '{
  "spec":{"hub":{"api":{"replicas":1},"content":{"replicas":1},"worker":{"replicas":1},"web":{"replicas":1}}}
}'
```

Do **not** restart shared `aap-postgres-15` for Hub-only issues anymore.

## Collection role
`infra.ado.ocp_aap_hub_harden` pins CR settings and installs/updates
`aap-hub-stability`. Defaults assume dedicated Hub Postgres pod
`aap-hub-dedicated-postgres-0`.
