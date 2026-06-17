# Running Safe-settings with GitHub Actions (GHA)

This guide describes how to schedule a full safe-settings sync using GitHub Actions. This assumes that an `admin` repository has been configured with your `safe-settings` configuration. Refer to the [How to Use](../README.md#how-to-use) docs for more details on that process.


## GitHub App Creation
Follow the [Create the GitHub App](deploy.md#create-the-github-app) guide to create an App in your GitHub account. This will allow `safe-settings` to access and modify your repos.


## Defining the GitHub Action Workflow
Running a full-sync with `safe-settings` can be done via `npm run full-sync`. This requires installing Node, such as with [actions/setup-node](https://github.com/actions/setup-node) (see example below). When doing so, the appropriate environment variables must be set (see the [Environment variables](#environment-variables) document for more details).


### GitHub Action Mode

When running safe-settings in GitHub Actions, you can enable `GITHUB_ACTION_MODE=true` to automatically post PR comments using the built-in GitHub Actions environment variables. When this mode is enabled:

- `GITHUB_REPOSITORY` (format: `owner/repo`) - automatically injected by GitHub Actions
- `GITHUB_REF` (format: `refs/pull/123/merge` for PRs) - automatically injected by GitHub Actions

These variables are used to identify the PR and post comments without additional configuration.

### Example GHA Workflow
The below example uses the GHA "cron" feature to run a full-sync every 4 hours. While not required, this example uses the `.github` repo as the `admin` repo (set via `ADMIN_REPO` env var) and the safe-settings configurations are stored in the `safe-settings/` directory (set via `CONFIG_PATH` and `DEPLOYMENT_CONFIG_FILE`).

```yaml
name: Safe Settings Sync
on:
  schedule:
    - cron: "0 */4 * * *"
  workflow_dispatch: {}

jobs:
  safeSettingsSync:
    runs-on: ubuntu-latest
    env:
      # Version/tag of github/safe-settings repo to use:
      SAFE_SETTINGS_VERSION: 2.1.17

      # Path on GHA runner box where safe-settings code downloaded to:
      SAFE_SETTINGS_CODE_DIR: ${{ github.workspace }}/.safe-settings-code
    steps:
      # Self-checkout of 'admin' repo for access to safe-settings config:
      - uses: actions/checkout@v4

      # Checkout of safe-settings repo for running full sync:
      - uses: actions/checkout@v4
        with:
          repository: github/safe-settings
          ref: ${{ env.SAFE_SETTINGS_VERSION }}
          path: ${{ env.SAFE_SETTINGS_CODE_DIR }}
      - uses: actions/setup-node@v4
      - run: npm install
        working-directory: ${{ env.SAFE_SETTINGS_CODE_DIR }}
      - run: npm run full-sync
        working-directory: ${{ env.SAFE_SETTINGS_CODE_DIR }}
        env:
          GH_ORG: ${{ vars.SAFE_SETTINGS_GH_ORG }}
          APP_ID: ${{ vars.SAFE_SETTINGS_APP_ID }}
          PRIVATE_KEY: ${{ secrets.SAFE_SETTINGS_PRIVATE_KEY }}
          GITHUB_CLIENT_ID: ${{ vars.SAFE_SETTINGS_GITHUB_CLIENT_ID }}
          GITHUB_CLIENT_SECRET: ${{ secrets.SAFE_SETTINGS_GITHUB_CLIENT_SECRET }}
          ADMIN_REPO: .github
          CONFIG_PATH: safe-settings
          DEPLOYMENT_CONFIG_FILE: ${{ github.workspace }}/safe-settings/deployment-settings.yml
          # Enable GitHub Action mode to post PR comments using built-in env vars
          # GITHUB_REPOSITORY and GITHUB_REF are automatically injected by GitHub Actions
          GITHUB_ACTION_MODE: true
```
