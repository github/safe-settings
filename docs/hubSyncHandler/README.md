# Safe Settings Organization Sync & Dashboard

 This feature provides a centralized approach to managing the Safe-Settings Admin Repo, allowing Safe-Settings configurations to be sync'd across multiple ORGs.

## Overview

This feature adds a hub‑and‑spoke synchronization capability to Safe Settings.

One central **master admin repository** (the hub) serves as the authoritative source of configuration which is automatically propagated to each organization’s **admin repository** (the spokes).

**Note:** When something changes in the central repo, only those changed files are copied to each affected ORG’s admin repo, so everything stays in sync with little manual work.

## Sync Lifecycle (High Level)

```mermaid
graph TD
A0(PR Closed) --> A1(HUB Admin Repo)
A1(ORG Admin Repo) --> B(ORG Admin Repo)
A1(HUB Admin Repo) --> C(ORG Admin Repo)
A1(HUB Admin Repo) --> D(ORG Admin Repo)
```

## Environment Variables & Inputs

Environment variables specific to the 'Sync-Feature'

| Name | Purpose | Default |
|------|---------|---------|
| `SAFE_SETTINGS_HUB_REPO` | Repo for master safe-settings contents | admin-master |
| `SAFE_SETTINGS_HUB_ORG` | Organization that hold the Repo | admin-master-org |
| `SAFE_SETTINGS_HUB_PATH` | source folder | .github/safe-settings  |
| `SAFE_SETTINGS_HUB_DIRECT_PUSH` | Use a PR or direct commit | false |


---
---

## Hub Sync Scenarios

1. Sync the `Hub Admin Repo` changes to a `Safe-Settings Admin Repo` in **the same ORG** as the Hub Admin Repo.

2. Sync the `Hub Admin changes` to a `Safe-Settings Admin Repo` in **a different ORG**. 

3. _`'Global'`_ `Hub Admin Repo` updates. 
Changes will `applied to all Organization`

---

## Safe-Settings Hub API endpoints

### API Endpoints

The following table summarizes the Safe Settings API endpoints:

| Endpoint                                 | Method | Purpose                                              | Example Usage |
|------------------------------------------|--------|------------------------------------------------------|---------------|
| `/api/safe-settings/installation`        | GET    | Organization installation, repo, and sync status      | Fetch org status |
| `/api/safe-settings/hub/content`         | GET    | List hub repo files/directories                      | List hub files |
| `/api/safe-settings/hub/content/*`       | GET    | Fetch specific file or directory from hub repo        | Get file content |
| `/api/safe-settings/hub/import`          | POST   | Import settings from orgs into the hub                | Import org settings |
| `/api/safe-settings/env`                 | GET    | App environment/config variables                      | Get env vars |

**Examples:**
- Fetch org installation status:
  ```http
  GET /api/safe-settings/installation
  ```
- Import settings from orgs:
  ```http
  POST /api/safe-settings/hub/import
  Body: { "orgs": ["org1", "org2"] }
  ```
- List hub repo files:
  ```http
  GET /api/safe-settings/hub/content?ref=main&recursive=true
  ```
- Get environment variables:
  ```http
  GET /api/safe-settings/env
  ```

---

