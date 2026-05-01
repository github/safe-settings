# Standalone Mode - Changes from Upstream

This document tracks the changes made to the toddwalstad/safe-settings fork to support standalone mode without requiring a GitHub App server.

## Summary

The standalone mode implementation is completely **additive** - no core safe-settings functionality was modified. All changes are isolated to the `standalone/` directory and a single npm script addition.

## Files Added

### 1. `standalone/standalone-sync.js`
**Purpose**: Main script for running safe-settings without a webhook server

**Architecture**: A thin subclass (`StandaloneSettings`) of the core `Settings` class that overrides only what's needed for standalone execution:
1. **Config loading** → reads YAML from the local filesystem instead of GitHub API
2. **Repo listing** → uses `repos.listForOrg` instead of the App-only `/installation/repositories`
3. **Result handling** → prints to stdout instead of creating GitHub check runs

All merging logic, plugin orchestration, suborg resolution, validation, and `restrictedRepos` filtering is inherited directly from the core `Settings` class.

**Features**:
- Token-based authentication (PAT or GitHub App token)
- Full plugin support (all 12 plugins: repository, labels, collaborators, teams, milestones, branches, autolinks, validator, rulesets, environments, custom_properties, variables)
- Suborg support (name patterns, teams, custom properties — via inherited logic)
- Dry-run (nop) mode with change reporting
- GitHub Actions compatible
- Minimal code surface — easy to keep in sync with upstream

**Key Implementation Details**:
- Extends `Settings` class with ~5 method overrides
- Uses `@octokit/rest` with simple token authentication
- Resolves config base path (supports Actions layout and local testing)
- Provides a mock `context` object to satisfy the `Settings` constructor

### 2. `standalone/README.md`
**Purpose**: Complete documentation for standalone mode

**Contents**:
- Architecture overview
- Setup instructions
- Configuration guide
- Usage examples (local and GitHub Actions)
- Comparison with full-sync.js and webhook modes
- Troubleshooting guide

### 3. `standalone/CHANGES.md` (this file)
**Purpose**: Document changes from upstream for maintainability

## Files Modified

### 1. `package.json`
**Change**: Added npm script
```json
"standalone-sync": "node ./standalone/standalone-sync.js"
```

**Why**: Provides convenient npm command for running standalone mode

### 2. `package-lock.json`
**Change**: No functional changes - just lockfile updates from `npm install`

## Core Dependencies Used

The standalone mode directly extends the core `Settings` class:

### Core (Inherited via subclass)
- `lib/settings.js` - The `StandaloneSettings` class extends this directly
- All plugins registered in `Settings.PLUGINS` (repository, labels, collaborators, teams, milestones, branches, autolinks, validator, rulesets, environments, custom_properties, variables)
- `lib/mergeDeep.js` - Deep merging logic (used internally by Settings)
- `lib/glob.js` - Glob pattern matching for restrictedRepos
- `lib/env.js` - Environment variable configuration

### External Dependencies (Already in package.json)
- `@octokit/rest` - GitHub API client
- `js-yaml` - YAML parsing

## Why No Core Changes Were Needed

The `Settings` class has a clean separation of concerns:
1. **Config loading** (`loadYaml`, `getRepoConfigMap`, `getSubOrgConfigMap`) - Overridden to use filesystem
2. **Repo enumeration** (`eachRepositoryRepos`) - Overridden to use org API
3. **Result reporting** (`handleResults`, `createCheckRun`) - Overridden for stdout
4. **Everything else** (merging, plugin orchestration, validation, filtering) - Inherited as-is

This subclass approach means:
- Any new plugins added upstream automatically work in standalone mode
- Bug fixes to merging/filtering logic are inherited for free
- The standalone code surface is minimal (~150 lines of overrides)

## Merging Strategy for Upstream Updates

When pulling updates from upstream `github/safe-settings`:

### Safe to Update (no conflicts expected)
✅ All core plugins (`lib/plugins/*.js`) - inherited automatically
✅ `lib/settings.js` - our subclass adapts to changes
✅ All utilities (`lib/*.js`)
✅ Documentation (`docs/`, `README.md`)
✅ Tests (`test/`)
✅ Dependencies (via `npm update`)

### Manual Review Required
⚠️ `package.json` - Preserve the `standalone-sync` script
⚠️ `lib/settings.js` - If method signatures change for overridden methods (`loadYaml`, `getRepoConfigMap`, `getSubOrgConfigMap`, `eachRepositoryRepos`)

### Our Custom Code
🔒 `standalone/` directory - All our changes are here

### Recommended Merge Process
```bash
# Fetch upstream
git fetch upstream

# Merge upstream changes
git merge upstream/main-enterprise

# Resolve conflicts in package.json (keep our standalone-sync script)
npm install

# Verify standalone still loads correctly
node --check standalone/standalone-sync.js

# Test standalone mode
DRY_RUN=true GH_ORG=your-org GITHUB_TOKEN=your-token npm run standalone-sync
```

## Testing Standalone Mode

After merging upstream changes, verify:

```bash
# 1. Dry run test
DRY_RUN=true npm run standalone-sync

# 2. Check plugin loading
npm run standalone-sync 2>&1 | grep "Plugin"

# 3. Verify config loading
npm run standalone-sync 2>&1 | grep "Loaded settings"

# 4. Test with actual sync (if safe)
npm run standalone-sync
```

## Future Enhancements

Potential improvements:

1. **Upstream integration** - Submit as a PR to `github/safe-settings` since the subclass approach is clean and non-invasive
2. **Selective sync** - Use `syncSelectedRepos` instead of `syncAll` for PR-only changed repos
3. **Config validation** - Pre-validate YAML schema before applying

## Support

For issues specific to standalone mode:
- Check `standalone/README.md` for usage instructions
- Review error messages and logs
- Verify config file syntax (YAML validation)
- Test with `DRY_RUN=true` first

For upstream safe-settings issues:
- Check [github/safe-settings](https://github.com/github/safe-settings) documentation
- Review plugin documentation in `docs/`
