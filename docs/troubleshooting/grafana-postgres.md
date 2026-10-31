---
id: grafana-postgres
component: infra.automation_development_office.grafana_install
status: source-fixed
keywords: grafana, postgres, postgresql, sqlite, grafana_database_type, grafana_install_postgres_reset_data, migration
---

# Grafana database type and PostgreSQL reset

## Problem

Grafana is on SQLite when PostgreSQL was intended, or the in-cluster PostgreSQL pod is crash-looping on its data volume.

## Symptoms

- Grafana is still using the default SQLite database.
- PostgreSQL for Grafana does not become ready.
- A data-volume reset is needed after CrashLoopBackOff on NFS.

## Root cause

`grafana_database_type` defaults to `sqlite`. PostgreSQL is used only when it is set to `postgres`. `grafana_install_postgres_reset_data` defaults to false. When true, the role deletes the `grafana-postgres` Deployment and PVC before recreate, which wipes the database.

## Resolution

Set `grafana_database_type: postgres` to provision in-cluster PostgreSQL (`grafana_database_provision` defaults to true). Set `grafana_install_postgres_reset_data: true` only when you intend to wipe that database and recreate it. External PostgreSQL uses `grafana_database_provision: false` plus `grafana_postgres_host` and `grafana_postgres_password`.

## Simpler

SQLite is the default. PostgreSQL starts only when you select it. The reset flag deletes the Grafana database volume. Leave it false unless you mean to wipe that data.

## Discovery

Check `grafana_database_type` and `grafana_install_postgres_reset_data` in the generated Grafana vars. This entry has no recorded cluster command.

## Verification

The variables and the wipe warning are in `roles/grafana_install/README.md`. This entry does not record a live migration.

Status source-fixed: the behavior is in the role source and README. It is not a recorded cluster verification.

## Sources

- infra.automation_development_office/roles/grafana_install/README.md
