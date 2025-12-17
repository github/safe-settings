# Standalone Mode - Changes from Upstream

This document tracks the changes made to the toddwalstad/safe-settings fork to support standalone mode without requiring a GitHub App server.

## Summary

The standalone mode implementation is completely **additive** - no core safe-settings functionality was modified. All changes are isolated to the `standalone/` directory and a single npm script addition.

## Files Added

### 1. `standalone/standalone-sync.js`
**Purpose**: Main script for running safe-settings without a webhook server

**Features**:
- Token-based authentication (PAT or GitHub App token)
- Direct filesystem config loading from admin repository
- Organization-level repository pagination
- Suborg support (group repos by name pattern, team, or custom property)
- Direct plugin execution (Repository, Teams, Rulesets, CustomProperties)
- Custom properties merging across org/suborg/repo levels
- Dry-run mode support
- GitHub Actions compatible

**Key Implementation Details**:
- Uses `@octokit/rest` with simple token authentication
- Loads configs directly from filesystem paths (no GitHub API config fetch)
- Merges settings from 3 levels: org → suborg → repo
- Implements custom array merging by property name for teams, custom_properties
- Applies settings per-repository with error handling

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

The standalone mode leverages existing safe-settings infrastructure:

### Plugins (Unchanged)
- `lib/plugins/repository.js` - Repository settings
- `lib/plugins/teams.js` - Team permissions
- `lib/plugins/rulesets.js` - Branch rulesets
- `lib/plugins/custom_properties.js` - Custom properties

### Utilities (Unchanged)
- `lib/mergeDeep.js` - Deep merging logic
- `lib/mergeArrayBy.js` - Array merging by property

### External Dependencies (Already in package.json)
- `@octokit/rest` - GitHub API client
- `js-yaml` - YAML parsing
- `minimatch` - Glob pattern matching

## Why No Core Changes Were Needed

Safe-settings has a clean plugin architecture that separates:
1. **Event handling** (webhooks) - Not needed for standalone
2. **Config loading** (GitHub API) - Replaced with filesystem loading
3. **Settings application** (plugins) - **Reused as-is**

The plugin classes (`Repository`, `Teams`, `Rulesets`, `CustomProperties`) expose clean interfaces:
```javascript
const plugin = new Plugin(nop, github, repo, config, log, errors)
await plugin.sync()
```

This made it possible to build standalone mode without modifying any core functionality.

## Merging Strategy for Upstream Updates

When pulling updates from upstream `github/safe-settings`:

### Safe to Update
✅ All core plugins (`lib/plugins/*.js`)
✅ All utilities (`lib/*.js`)
✅ Documentation (`docs/`, `README.md`)
✅ Tests (`test/`)
✅ Dependencies (via `npm update`)

### Manual Review Required
⚠️ `package.json` - Preserve the `standalone-sync` script
⚠️ `package-lock.json` - May have conflicts, regenerate if needed

### Our Custom Code
🔒 `standalone/` directory - Keep all our changes

### Recommended Merge Process
```bash
# Add upstream remote (if not already added)
git remote add upstream https://github.com/github/safe-settings.git

# Fetch upstream
git fetch upstream

# Merge upstream changes
git merge upstream/main-enterprise

# Resolve conflicts in package.json (keep our standalone-sync script)
# Regenerate package-lock.json if needed
npm install

# Test standalone mode still works
npm run standalone-sync -- --help
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

Potential improvements that maintain separation from core:

1. **Webhook compatibility** - Make standalone mode callable from webhook events
2. **Partial sync** - Sync only specific plugins (e.g., only rulesets)
3. **Diff preview** - Show what would change before applying
4. **Rollback support** - Save state before changes for easy rollback
5. **Parallel execution** - Process multiple repos concurrently
6. **Config validation** - Pre-validate YAML before applying

All of these can be implemented within the `standalone/` directory without core changes.

## Support

For issues specific to standalone mode:
- Check `standalone/README.md` for usage instructions
- Review error messages and logs
- Verify config file syntax (YAML validation)
- Test with `DRY_RUN=true` first

For upstream safe-settings issues:
- Check [github/safe-settings](https://github.com/github/safe-settings) documentation
- Review plugin documentation in `docs/`
