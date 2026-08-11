# AAP Hub recovery and permanence (prod `aap` namespace)

## Root cause
Shared Postgres (`aap-postgres-15-0`) serves Controller + Hub. Hub API/web probes and gunicorn workers hammer `core_apiappstatus`. Concurrent SELECTs + autovacuum ANALYZE create **LWLock BufferContent** storms:

- gunicorn `WORKER TIMEOUT` / SIGKILL
- `aap-hub-api` / `aap-hub-web` never Ready
- `/api/galaxy/` and gateway `/api/galaxy/` return **503**

`pg_terminate_backend` often **cannot** clear these waits; Postgres restart is required.

## Permanent operating posture (already applied)
1. **Hub replicas = 1/1/1/1** on parent `AnsibleAutomationPlatform/aap` (`api`/`content`/`worker`/`web`). Do not scale content/worker to 2 while sharing Postgres.
2. **`gunicorn_api_workers: 1`** (and content workers 1) on `AutomationHub/aap-hub` — fewer concurrent status SELECTs.
3. **`gunicorn_timeout: 180`**, longer nginx/haproxy proxy timeouts on `AutomationHub`.
4. **Postgres table knobs** on `automationhub.public.core_apiappstatus` — high analyze threshold so autoanalyze stops thrashing that relation.
5. **CronJob `aap-hub-stability`** (every 15m) in `aap`:
   - re-pins parent CR replicas to 1 and Hub gunicorn workers/timeouts
   - terminates only *long-stuck* (`>120s`) LWLock sessions on `core_apiappstatus`
   - `VACUUM` that table (no ANALYZE — ANALYZE has hit `pg_subtrans` corruption on this cluster)

Do **not** fight the Hub operator by patching Deploy probes every few minutes — it immediately resets HTTP liveness on `/api/galaxy/pulp/api/v3/status/` and causes unnecessary rollouts. Worker count + vacuum is the durable lever.

## Recovery (when Hub is already dead)
```bash
# 1) Stop Hub traffic to Postgres
oc -n aap patch ansibleautomationplatform aap --type=merge -p '{
  "spec": {"hub": {
    "api": {"replicas": 0},
    "content": {"replicas": 0},
    "worker": {"replicas": 0},
    "web": {"replicas": 0}
  }}
}'
oc -n aap scale deploy/aap-hub-api deploy/aap-hub-content deploy/aap-hub-worker deploy/aap-hub-web --replicas=0

# 2) Restart shared Postgres (clears unkillable LWLocks; brief Controller blip)
oc -n aap delete pod aap-postgres-15-0
oc -n aap wait --for=condition=Ready pod/aap-postgres-15-0 --timeout=300s

# 3) Vacuum (skip ANALYZE if pg_subtrans errors)
oc -n aap exec aap-postgres-15-0 -- bash -lc "psql -U postgres -d automationhub -v ON_ERROR_STOP=0 <<'SQL'
ALTER TABLE public.core_apiappstatus SET (
  autovacuum_enabled = true,
  autovacuum_vacuum_scale_factor = 0.2,
  autovacuum_analyze_scale_factor = 1.0,
  autovacuum_vacuum_threshold = 50,
  autovacuum_analyze_threshold = 100
);
VACUUM public.core_apiappstatus;
SQL"

# 4) Re-pin Hub settings and bring back at 1
oc -n aap patch automationhub aap-hub --type=merge -p '{
  "spec": {
    "gunicorn_api_workers": 1,
    "gunicorn_content_workers": 1,
    "gunicorn_timeout": 180
  }
}'
oc -n aap patch ansibleautomationplatform aap --type=merge -p '{
  "spec": {"hub": {
    "api": {"replicas": 1},
    "content": {"replicas": 1},
    "worker": {"replicas": 1},
    "web": {"replicas": 1}
  }}
}'

# 5) Verify
curl -sk -o /dev/null -w 'hub=%{http_code}\n' https://aap-hub-aap.apps.ocp.prod.rhlab/api/galaxy/
curl -sk -o /dev/null -w 'gw=%{http_code}\n' https://aap-aap.apps.ocp.prod.rhlab/api/galaxy/
```

## Collection role
`infra.ado.ocp_aap_hub_harden` applies the same CR pins and installs/updates CronJob `aap-hub-stability` (CLI/bootstrap friendly).

## Follow-up if storms return at 1 worker
Move Hub to a **dedicated Postgres** (separate from Controller). That is the only complete fix for shared-buffer LWLock contention under probe load.
