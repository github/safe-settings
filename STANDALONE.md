# Standalone Sync Script

This is a custom script added to run safe-settings without webhook triggers, designed specifically for GitHub Actions or CLI execution.

## Features

- ✅ No webhook server required
- ✅ Direct GitHub API access via GitHub App
- ✅ Reads configuration from file system
- ✅ Supports dry-run mode
- ✅ Organization and repository filtering
- ✅ Comprehensive logging

## Usage

### From GitHub Actions

The workflows in `edge-devops-safe-settings` are configured to use this script:

```yaml
- name: Run sync
  run: npm run standalone-sync
  env:
    GH_ORG: etn-ccis
    APP_ID: ${{ vars.SAFE_SETTINGS_APP_ID }}
    PRIVATE_KEY: ${{ secrets.SAFE_SETTINGS_PRIVATE_KEY }}
    ADMIN_REPO: edge-devops-safe-settings
    CONFIG_PATH: .github
    DRY_RUN: false
```

### From Command Line

```bash
# Navigate to the safe-settings fork
cd safe-settings

# Install dependencies
npm install

# Set environment variables
export GH_ORG=etn-ccis
export APP_ID=your-app-id
export PRIVATE_KEY="$(cat path/to/private-key.pem)"
export ADMIN_REPO=edge-devops-safe-settings
export CONFIG_PATH=.github

# Run sync
npm run standalone-sync

# Or with dry-run
DRY_RUN=true npm run standalone-sync
```

## Environment Variables

### Required

- `GH_ORG` - GitHub organization name
- `APP_ID` - GitHub App ID
- `PRIVATE_KEY` - GitHub App private key (full PEM content)

### Optional

- `ADMIN_REPO` - Admin repository name (default: `edge-devops-safe-settings`)
- `CONFIG_PATH` - Path to config directory (default: `.github`)
- `SETTINGS_FILE_PATH` - Settings filename (default: `settings.yml`)
- `DEPLOYMENT_CONFIG_FILE` - Deployment config filename (default: `deployment-settings.yml`)
- `LOG_LEVEL` - Logging level: `error`, `warn`, `info`, `debug`, `trace` (default: `info`)
- `DRY_RUN` - Run without making changes: `true` or `false` (default: `false`)
- `GITHUB_CLIENT_ID` - Optional GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET` - Optional GitHub OAuth client secret

## How It Works

1. **Authenticates** with GitHub using the GitHub App credentials
2. **Loads configuration** from the admin repository file system:
   - Organization-wide settings from `.github/settings.yml`
   - Deployment settings from `.github/deployment-settings.yml`
   - Repository-specific settings from `.github/repos/*.yml`
3. **Fetches repositories** from the organization via GitHub API
4. **Filters repositories** based on deployment config (include/exclude patterns)
5. **Applies settings** to each repository (or shows what would be applied in dry-run mode)
6. **Reports results** with success/failure summary

## Directory Structure

The script expects the admin repo to be checked out in a sibling directory:

```
workspace/
├── safe-settings/           # This repo
│   ├── standalone-sync.js   # The script
│   └── package.json
└── admin-repo/              # edge-devops-safe-settings
    └── .github/
        ├── settings.yml
        ├── deployment-settings.yml
        └── repos/
            ├── repo1.yml
            └── repo2.yml
```

## Dry-Run Mode

When `DRY_RUN=true`, the script will:
- Load all configurations
- Fetch all repositories
- Show what settings would be applied
- **NOT** make any actual changes to GitHub

This is perfect for:
- Testing configuration changes
- PR validation
- Understanding impact before applying

## Logging

Set `LOG_LEVEL` to control verbosity:

- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General info (default, recommended)
- `debug` - Detailed debug info
- `trace` - Very verbose (includes all API calls)

## Error Handling

The script will:
- Exit with code `1` if any fatal errors occur
- Continue processing other repos if one fails
- Report summary of successes and failures at the end
- Exit with code `1` if any repositories failed

## Next Steps

To fully implement settings application, you'll need to add the actual GitHub API calls in the `standalone-sync.js` file where it says:

```javascript
// TODO: Implement actual settings application via API
```

This could include calling the safe-settings library functions or implementing direct API calls for:
- Repository settings
- Branch protection (rulesets)
- Team permissions
- Custom properties
- Labels, topics, etc.

## Differences from Original

This script differs from the original `full-sync.js`:

| Feature | full-sync.js | standalone-sync.js |
|---------|--------------|-------------------|
| Requires Probot | Yes | No |
| Webhook server | Yes | No |
| File system config | No | Yes |
| Dry-run mode | Via env | Built-in |
| Direct API access | Via context | Via Octokit |
| GitHub Actions friendly | Partial | Fully |

## Dependencies Added

- `@octokit/rest` - GitHub REST API client
- `@octokit/auth-app` - GitHub App authentication

These are added to `package.json` and will be installed with `npm install`.
