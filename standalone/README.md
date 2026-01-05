# Standalone Mode for Safe-Settings

Standalone mode allows you to run safe-settings without a webhook server, making it perfect for GitHub Actions, scheduled jobs, or CLI execution.

## 📁 Directory Structure

```
standalone/
├── README.md           # This file - complete documentation
├── CHANGES.md          # Changes from upstream (for maintainability)
└── standalone-sync.js  # Main standalone script
```

## How It Works

The `standalone-sync.js` script provides a simplified deployment option that:

1. **Loads configuration from the filesystem** - Reads YAML configs from your local/checked-out admin repository
2. **Uses the real safe-settings engine** - Imports and calls `Settings.sync()` from `lib/settings.js` to actually apply settings
3. **Authenticates with a simple token** - Uses PAT or GitHub App token instead of full GitHub App authentication
4. **Applies settings via GitHub API** - Makes real API calls to update teams, rulesets, properties, etc.

This gives you the full power of safe-settings without needing a webhook server or GitHub App installation.

## Features

- ✅ No webhook server required
- ✅ Simple token-based authentication (PAT or GitHub App token)
- ✅ Direct GitHub API access via real safe-settings Settings class
- ✅ Reads configuration from file system
- ✅ Supports dry-run mode
- ✅ Organization and repository filtering
- ✅ Suborg support with pattern matching
- ✅ Auto-generation of include list from suborg configs
- ✅ Pagination for large organizations (100+ repos)
- ✅ Comprehensive logging

## Implementation Details

The script creates a mock context object that satisfies the Settings class requirements:

```javascript
const context = {
  payload: { installation: { id: 1 } },  // Dummy ID for token auth
  octokit,                                // Authenticated Octokit instance  
  log: logger,                            // Logger instance
  repo: () => ({ owner, repo })           // Repository info
}
```

Then calls the real Settings.sync() method:

```javascript
await Settings.sync(nop, context, { owner, repo }, config, 'main')
```

This means all the safe-settings plugins and logic work exactly as designed!

## Usage

### From GitHub Actions

The workflows in `edge-devops-safe-settings` are configured to use this script:

```yaml
- name: Run sync
  run: npm run standalone-sync
  env:
    GH_ORG: etn-ccis
    GITHUB_TOKEN: ${{ secrets.SAFE_SETTINGS_TOKEN }}
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
export GITHUB_TOKEN=ghp_your_personal_access_token
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
- `GITHUB_TOKEN` or `GH_TOKEN` - GitHub authentication token
  - Can be a Personal Access Token (PAT)
  - Can be a GitHub App installation token
  - Can be GitHub Actions `GITHUB_TOKEN` (with appropriate permissions)

### Optional

- `ADMIN_REPO` - Admin repository name (default: `edge-devops-safe-settings`)
- `CONFIG_PATH` - Path to config directory (default: `.github`)
- `SETTINGS_FILE_PATH` - Settings filename (default: `settings.yml`)
- `DEPLOYMENT_CONFIG_FILE` - Deployment config filename (default: `deployment-settings.yml`)
- `LOG_LEVEL` - Logging level: `error`, `warn`, `info`, `debug`, `trace` (default: `info`)
- `DRY_RUN` - Run without making changes: `true` or `false` (default: `false`)

## Token Requirements

Your GitHub token needs these permissions:

**For Organization:**
- `read:org` - Read organization data
- `admin:org` - Manage organization settings (if applying org-level settings)

**For Repositories:**
- `repo` - Full repository access
- `admin:repo_hook` - Manage repository webhooks
- `write:repo_hook` - Write repository webhooks

**For Teams:**
- `read:org` - Read team data
- `write:org` - Manage team access

### Creating a Personal Access Token (PAT)

1. Go to GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Click "Generate new token"
3. Select your organization under "Resource owner"
4. Set expiration and permissions as listed above
5. Generate and copy the token
6. Add as `SAFE_SETTINGS_TOKEN` secret in your repo

### Using GitHub App Token

If you prefer using a GitHub App:

1. Create a GitHub App with required permissions
2. Generate an installation token via API
3. Use that token as `GITHUB_TOKEN`

Note: GitHub App tokens expire after 1 hour, so you'd need to regenerate them for each run.

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

## Expected Warnings

When running the script, you may see some warnings that are **expected and safe to ignore**:

### ConfigManager GitHub API Warnings

```
GET /repos/.../contents/.../.github - 404
Error reading c:\git\...\edge-devops-safe-settings\.github directory
```

**Why:** The Settings class internally tries to reload configs from GitHub API, but we've already loaded them from the filesystem. These 404s don't affect operation - the settings are still applied correctly.

### Check Run Errors

```
POST /repos/.../check-runs - 403
You must authenticate via a GitHub App
```

**Why:** The Settings class tries to create GitHub check runs to report status. This requires GitHub App authentication, but we're using a simpler PAT. The actual settings application works fine without check runs.

### What Matters

Look for these indicators of success:
- `✅ Successfully applied settings to <repo-name>`
- `Successful: N` in the summary (should match total repos processed)
- No entries under "Failed repositories"

You can verify actual application by checking GitHub:
- Teams added/updated
- Custom properties set
- Rulesets created/updated

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

This is added to `package.json` and will be installed with `npm install`.
