/* eslint-disable no-undef */
'use strict'

const Settings = require('../../../lib/settings')
const { isEmptyChange, isDeepEmpty } = require('../../../lib/settings')
const env = require('../../../lib/env')

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

function makeNopResult ({ repo = 'my-repo', plugin = 'labels', additions = ['label-a'], deletions = null, modifications = null } = {}) {
  return {
    type: 'NOP',
    plugin,
    repo,
    endpoint: 'https://api.github.com/repos/test-org/my-repo/labels',
    body: {},
    action: {
      additions,
      deletions,
      modifications
    }
  }
}

function makeErrorResult ({ repo = 'my-repo', plugin = 'labels', msg = 'Something went wrong' } = {}) {
  return {
    type: 'ERROR',
    plugin,
    repo,
    endpoint: 'https://api.github.com/repos/test-org/my-repo/labels',
    body: {},
    action: {
      additions: null,
      deletions: null,
      modifications: null,
      msg
    }
  }
}

function buildContext (overrides = {}) {
  const createComment = jest.fn().mockResolvedValue({})
  const checksUpdate = jest.fn().mockResolvedValue({})

  const context = {
    payload: {
      installation: { id: 1 },
      check_run: {
        id: 42,
        check_suite: {
          pull_requests: [{ number: 7 }]
        }
      },
      repository: {
        owner: { login: 'test-org' },
        name: 'admin'
      }
    },
    octokit: {
      rest: {
        issues: { createComment },
        checks: { update: checksUpdate }
      }
    },
    log: {
      debug: jest.fn(),
      info: jest.fn(),
      error: jest.fn()
    },
    ...overrides
  }

  return { context, createComment, checksUpdate }
}

function buildSettings (context, results = [], config = {}, baseConfig = null) {
  const settings = new Settings(
    /* nop */ true,
    context,
    { owner: 'test-org', repo: 'admin' },
    /* config */ config,
    /* ref */ 'main',
    /* suborg */ null,
    /* baseConfig */ baseConfig
  )
  settings.results = results
  return settings
}

function getCommentBodies (createComment) {
  expect(createComment).toHaveBeenCalled()
  return createComment.mock.calls.map(([request]) => request.body)
}

function getCombinedCommentBody (createComment) {
  return getCommentBodies(createComment).join('\n\n')
}

// ---------------------------------------------------------------------------
// Restore env after each test
// ---------------------------------------------------------------------------

let originalCreatePrComment

beforeEach(() => {
  originalCreatePrComment = env.CREATE_PR_COMMENT
  env.CREATE_PR_COMMENT = 'true'
})

afterEach(() => {
  env.CREATE_PR_COMMENT = originalCreatePrComment
})

// ---------------------------------------------------------------------------
// Test Plan
// ---------------------------------------------------------------------------

/*
 * Code Summary
 * ------------
 * handleResults() is the final step of every sync flow. When nop=true it
 * renders a human-readable markdown summary of all NopCommand results,
 * optionally posts that summary as a PR comment via the GitHub Issues API, and
 * always updates a check run via the Checks API with the Eta-rendered template.
 *
 * Primary concern: the two API calls receive correctly shaped bodies, edge
 * cases (empty results, all-null actions, errors) are handled, and the
 * CREATE_PR_COMMENT env flag is respected.
 */

describe('handleResults()', () => {
  // -------------------------------------------------------------------------
  // Test 1 — empty state
  // -------------------------------------------------------------------------
  describe('renders empty state without changes', () => {
    it('PR comment body contains _No changes to apply._', async () => {
      // Arrange
      const { context, createComment } = buildContext()
      const settings = buildSettings(context, [])

      // Act
      await settings.handleResults()

      // Assert
      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('_No changes to apply._')
    })

    it('check run summary contains "No changes to apply"', async () => {
      // Arrange
      const { context, checksUpdate } = buildContext()
      const settings = buildSettings(context, [])

      // Act
      await settings.handleResults()

      // Assert
      expect(checksUpdate).toHaveBeenCalledTimes(1)
      const summary = checksUpdate.mock.calls[0][0].output.summary
      expect(summary).toMatch(/No changes to apply/i)
    })
  })

  // -------------------------------------------------------------------------
  // Test 2 — PR comment contains <details>/<summary> tags with a real result
  // -------------------------------------------------------------------------
  describe('PR comment body contains details tags', () => {
    it('wraps per-plugin changes in a collapsible <details> section', async () => {
      // Arrange
      const { context, createComment } = buildContext()
      const result = makeNopResult({ repo: 'my-repo', plugin: 'labels', additions: ['bug', 'enhancement'] })
      const settings = buildSettings(context, [result])

      // Act
      await settings.handleResults()

      // Assert
      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('<details>')
      expect(body).toContain('<summary>')
    })
  })

  // -------------------------------------------------------------------------
  // Test 3 — check run summary contains <details>/<summary> tags
  // -------------------------------------------------------------------------
  describe('check run summary contains details tags', () => {
    it('wraps changes section in collapsible HTML when there are results', async () => {
      // Arrange
      const { context, checksUpdate } = buildContext()
      const result = makeNopResult({ repo: 'my-repo', plugin: 'labels', additions: ['bug'] })
      const settings = buildSettings(context, [result])

      // Act
      await settings.handleResults()

      // Assert
      const summary = checksUpdate.mock.calls[0][0].output.summary
      expect(summary).toContain('<details>')
      expect(summary).toContain('<summary>')
    })
  })

  // -------------------------------------------------------------------------
  // Test 4 — output stays under 55536 chars with 200 results
  // -------------------------------------------------------------------------
  describe('output stays under 55536 chars with many repos', () => {
    it('each comment page and the summary are under the limit and are not truncated', async () => {
      // Arrange
      const { context, createComment, checksUpdate } = buildContext()

      const REPOS = 40
      const PLUGINS = ['labels', 'teams', 'collaborators', 'branches', 'environments']

      const results = []
      for (let r = 0; r < REPOS; r++) {
        for (const plugin of PLUGINS) {
          results.push(makeNopResult({ repo: `repo-${r}`, plugin, additions: ['item-a', 'item-b'] }))
        }
      }

      const settings = buildSettings(context, results)

      // Act
      await settings.handleResults()

      // Assert — paginated bodies
      const bodies = getCommentBodies(createComment)
      expect(bodies.length).toBeGreaterThan(0)
      bodies.forEach(body => {
        expect(body.length).toBeLessThanOrEqual(55536)
        expect(body).not.toContain('too many changes to report')
      })

      // Assert — summary
      const summary = checksUpdate.mock.calls[0][0].output.summary
      expect(summary.length).toBeLessThan(55536)
      expect(summary).not.toContain('too many changes to report')
    })

    it('truncates oversized PR comments without exceeding the limit', async () => {
      const { context, createComment } = buildContext()
      const result = makeNopResult({
        repo: 'huge-repo',
        plugin: 'labels',
        additions: [{ name: 'huge-label', description: 'x'.repeat(60000) }]
      })
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const bodies = getCommentBodies(createComment)
      bodies.forEach(body => {
        expect(body.length).toBeLessThanOrEqual(55536)
      })
      expect(bodies.some(body => body.includes('too many changes to report'))).toBe(true)
    })

    it('truncates oversized check-run summaries without exceeding the limit', async () => {
      const { context, checksUpdate } = buildContext()
      const errorResult = makeErrorResult({
        repo: 'broken-repo',
        msg: 'x'.repeat(60000)
      })
      const settings = buildSettings(context, [errorResult])

      await settings.handleResults()

      const summary = checksUpdate.mock.calls[0][0].output.summary
      expect(summary.length).toBeLessThanOrEqual(55536)
      expect(summary).toContain('too many changes to report')
    })
  })

  // -------------------------------------------------------------------------
  // Test 5 — errors are wrapped in a collapsible section
  // -------------------------------------------------------------------------
  describe('errors are wrapped in collapsible section', () => {
    it('body contains ⚠️ Errors heading and a <details> element when there is an ERROR result', async () => {
      // Arrange
      const { context, createComment } = buildContext()
      const result = makeErrorResult({ repo: 'broken-repo', msg: 'API rate limit exceeded' })
      const settings = buildSettings(context, [result])

      // Act
      await settings.handleResults()

      // Assert
      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('⚠️ Errors')
      expect(body).toContain('<details>')
    })
  })

  // -------------------------------------------------------------------------
  // Test 6 — repos with all-null actions are omitted from output
  // -------------------------------------------------------------------------
  describe('repos with all-null actions are omitted from output', () => {
    it('a result with additions/deletions/modifications all null does not appear in the PR comment body', async () => {
      // Arrange
      const { context, createComment } = buildContext()
      const nullResult = makeNopResult({
        repo: 'silent-repo',
        plugin: 'labels',
        additions: null,
        deletions: null,
        modifications: null
      })
      const settings = buildSettings(context, [nullResult])

      // Act
      await settings.handleResults()

      // Assert
      const body = getCombinedCommentBody(createComment)
      // The repo name should not appear in the changes table
      expect(body).not.toMatch(/silent-repo.*Add:/)
      // There must be no changes section referencing this repo
      expect(body).toContain('_No changes to apply._')
    })

    it('a result with empty-object/array action fields is filtered out', async () => {
      // Arrange
      const { context, createComment } = buildContext()
      const emptyResult = makeNopResult({
        repo: 'empty-repo',
        plugin: 'labels',
        additions: {},
        deletions: [],
        modifications: null
      })
      const settings = buildSettings(context, [emptyResult])

      // Act
      await settings.handleResults()

      // Assert
      const body = getCombinedCommentBody(createComment)
      expect(body).not.toContain('empty-repo')
      expect(body).toContain('_No changes to apply._')
    })
  })

  // -------------------------------------------------------------------------
  // Test 7 — org-level result rows display the admin repo
  // -------------------------------------------------------------------------
  describe('org-level labeling', () => {
    it('shows the admin repo name instead of the org target in output', async () => {
      // Arrange
      const { context, createComment } = buildContext()
      const orgResult = makeNopResult({
        repo: 'test-org (org)',
        plugin: 'rulesets',
        additions: [{ name: 'require-pull-request-reviews' }]
      })
      const settings = buildSettings(context, [orgResult])

      // Act
      await settings.handleResults()

      // Assert
      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('admin')
      expect(body).not.toContain('test-org (org)')
    })
  })

  // -------------------------------------------------------------------------
  // Test 8 — table-free rendering with trimmed changed fields
  // -------------------------------------------------------------------------
  describe('table-free rendering with trimmed changed fields', () => {
    it('shows affected admin target, changed policy, and field-level ruleset diff', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = {
        rulesets: [
          {
            name: 'Agent Studio - Required Workflows',
            conditions: { repository_name: { include: ['agent-*'] } }
          }
        ]
      }
      const prConfig = {
        rulesets: [
          {
            name: 'Agent Studio - Required Workflows',
            conditions: { repository_name: { include: ['mythapi-*'] } }
          }
        ]
      }
      const orgResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'test-org (org)',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [
            {
              name: 'Agent Studio - Required Workflows',
              conditions: { repository_name: { include: ['agent-*'] } }
            }
          ],
          modifications: [
            {
              name: 'Agent Studio - Required Workflows',
              conditions: { repository_name: { include: ['mythapi-*'] } },
              bypass_actors: [{ actor_id: 1 }]
            }
          ]
        }
      }

      const settings = buildSettings(context, [orgResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('**Repos affected:** 1')
      expect(body).toContain('<summary>Rulesets — 1 repo, 1 policy changed</summary>')
      expect(body).toContain('**admin**')
      expect(body).not.toContain('| Repo |')
      expect(body).not.toContain('<table>')
      expect(body).not.toContain('test-org (org)')
      expect(body).toContain('- `Agent Studio - Required Workflows`')
      expect(body).toContain('  - ~ `conditions.repository_name.include`')
      expect(body).toContain('    - before: `agent-*`')
      expect(body).toContain('    - after: `mythapi-*`')
      expect(body).not.toContain('bypass_actors')
    })

    it('does not render config-changed rulesets absent from NOP actions', async () => {
      const { context, createComment } = buildContext()
      const baseConfig = {
        rulesets: [
          { name: 'Rule B', conditions: { repository_name: { include: ['agent-*'] } } },
          { name: 'Rule D', enforcement: 'evaluate' }
        ]
      }
      const prConfig = {
        rulesets: [
          { name: 'Rule B', conditions: { repository_name: { include: ['mythapi-*'] } } },
          { name: 'Rule D', enforcement: 'active' }
        ]
      }
      const orgResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'test-org (org)',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [{ name: 'Rule B', conditions: { repository_name: { include: ['agent-*'] } } }],
          modifications: [{ name: 'Rule B', conditions: { repository_name: { include: ['mythapi-*'] } } }]
        }
      }
      const settings = buildSettings(context, [orgResult], prConfig, baseConfig)

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('Rule B')
      expect(body).not.toContain('Rule D')
      expect(body).toContain('<summary>Rulesets — 1 repo, 1 policy changed</summary>')
    })

    it('uses the same table-free trimmed details in the check-run summary', async () => {
      const { context, checksUpdate } = buildContext()
      const result = makeNopResult({
        repo: 'my-repo',
        plugin: 'labels',
        additions: null,
        modifications: [{ name: 'bug', color: 'blue' }]
      })
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const summary = checksUpdate.mock.calls[0][0].output.summary
      expect(summary).toContain('Number of repos affected')
      expect(summary).toContain('<summary>labels — 1 repo, 1 setting changed</summary>')
      expect(summary).toContain('**my-repo**')
      expect(summary).toContain('- `bug`')
      expect(summary).toContain('  - ~ `color`')
      expect(summary).toContain('    - after: `blue`')
      expect(summary).not.toContain('| Repo |')
      expect(summary).not.toContain('<table>')
    })

    it('pairs action diff entries by non-name identity fields', async () => {
      const { context, createComment } = buildContext()
      const result = makeNopResult({
        repo: 'my-repo',
        plugin: 'teams',
        deletions: [{ login: 'admin-team', permission: 'pull' }],
        modifications: [{ login: 'admin-team', permission: 'push' }]
      })
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('- `admin-team`')
      expect(body).toContain('  - ~ `permission`')
      expect(body).toContain('    - before: `pull`')
      expect(body).toContain('    - after: `push`')
    })

    it('prefers structured action fields over generic msg text', async () => {
      const { context, createComment } = buildContext()
      const result = {
        type: 'NOP',
        plugin: 'labels',
        repo: 'my-repo',
        endpoint: '',
        body: {},
        action: {
          msg: 'Changes found',
          additions: [{ name: 'security', color: 'red' }],
          deletions: null,
          modifications: null
        }
      }
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('security')
      expect(body).toContain('  - + `color`: `red`')
      expect(body).not.toContain('Changes found')
    })

    it('renders large object values as compact inline JSON', async () => {
      const { context, createComment } = buildContext()
      const result = makeNopResult({
        repo: 'my-repo',
        plugin: 'branches',
        additions: [{
          name: 'main',
          required_workflows: [{ path: '.github/workflows/build.yml', ref: 'main' }]
        }]
      })
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('- `main`')
      expect(body).toContain('required_workflows')
      expect(body).toContain('"path"')
      expect(body).toContain('.github/workflows/build.yml')
    })

    it('shows added and deleted fields within a matched modification', async () => {
      const { context, createComment } = buildContext()
      const result = {
        type: 'NOP',
        plugin: 'labels',
        repo: 'my-repo',
        endpoint: '',
        body: {},
        action: {
          additions: null,
          deletions: [{ name: 'bug', color: 'red', oldOnly: true }],
          modifications: [{ name: 'bug', color: 'blue', newOnly: true }]
        }
      }
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('  - ~ `color`')
      expect(body).toContain('    - before: `red`')
      expect(body).toContain('    - after: `blue`')
      expect(body).toContain('  - + `newOnly`: `true`')
      expect(body).toContain('  - - `oldOnly`: `true`')
    })

    it('detects nested value modifications beyond the display preview', async () => {
      const { context, createComment } = buildContext()
      const sharedPrefix = 'a'.repeat(240)
      const result = {
        type: 'NOP',
        plugin: 'branches',
        repo: 'my-repo',
        endpoint: '',
        body: {},
        action: {
          additions: null,
          deletions: [{
            name: 'main',
            required_workflows: [{ path: `${sharedPrefix}-OLD.yml`, ref: 'main' }],
            enforce_admins: false
          }],
          modifications: [{
            name: 'main',
            required_workflows: [{ path: `${sharedPrefix}-NEW.yml`, ref: 'main' }],
            enforce_admins: true
          }]
        }
      }
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('  - ~ `required_workflows`')
      expect(body).toContain('-OLD.yml')
      expect(body).toContain('-NEW.yml')
    })

    it('does not hide non-identity fields whose value equals the target name', async () => {
      const { context, createComment } = buildContext()
      const result = makeNopResult({
        repo: 'my-repo',
        plugin: 'labels',
        additions: [{ name: 'bug', description: 'bug', color: 'red' }]
      })
      const settings = buildSettings(context, [result])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('  - + `description`: `bug`')
      expect(body).toContain('  - + `color`: `red`')
    })
  })

  // -------------------------------------------------------------------------
  // Test 9 — does not create PR comment when CREATE_PR_COMMENT is not true
  // -------------------------------------------------------------------------
  describe('does not create PR comment when CREATE_PR_COMMENT is not true', () => {
    it('createComment is never called when CREATE_PR_COMMENT is "false"', async () => {
      // Arrange
      env.CREATE_PR_COMMENT = 'false'
      const { context, createComment, checksUpdate } = buildContext()
      const result = makeNopResult()
      const settings = buildSettings(context, [result])

      // Act
      await settings.handleResults()

      // Assert
      expect(createComment).not.toHaveBeenCalled()
      // checks.update must still be called regardless
      expect(checksUpdate).toHaveBeenCalledTimes(1)
    })

    it('createComment is never called when CREATE_PR_COMMENT is undefined', async () => {
      // Arrange
      env.CREATE_PR_COMMENT = undefined
      const { context, createComment } = buildContext()
      const result = makeNopResult()
      const settings = buildSettings(context, [result])

      // Act
      await settings.handleResults()

      // Assert
      expect(createComment).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Test 9 — isDeepEmpty recursive detection
  // -------------------------------------------------------------------------
  describe('isDeepEmpty recursive detection', () => {
    it('null/undefined are deep-empty', () => {
      expect(isDeepEmpty(null)).toBe(true)
      expect(isDeepEmpty(undefined)).toBe(true)
    })

    it('empty arrays and objects are deep-empty', () => {
      expect(isDeepEmpty([])).toBe(true)
      expect(isDeepEmpty({})).toBe(true)
    })

    it('nested empty structures are deep-empty', () => {
      expect(isDeepEmpty({ entries: [] })).toBe(true)
      expect(isDeepEmpty({ a: { b: [] } })).toBe(true)
      expect(isDeepEmpty({ a: null, b: undefined, c: {} })).toBe(true)
      expect(isDeepEmpty([{}, [], null])).toBe(true)
    })

    it('non-empty values are NOT deep-empty', () => {
      expect(isDeepEmpty('text')).toBe(false)
      expect(isDeepEmpty(42)).toBe(false)
      expect(isDeepEmpty(false)).toBe(false)
      expect(isDeepEmpty([1])).toBe(false)
      expect(isDeepEmpty({ key: 'value' })).toBe(false)
    })

    it('partially-filled nested structures are NOT deep-empty', () => {
      expect(isDeepEmpty({ entries: [{ name: 'x' }] })).toBe(false)
      expect(isDeepEmpty({ a: null, b: 'content' })).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Test 10 — isEmptyChange with deeply-nested empty structures
  // -------------------------------------------------------------------------
  describe('isEmptyChange with deeply-nested empty structures', () => {
    it('action with { entries: [] } additions is considered empty', () => {
      expect(isEmptyChange({ additions: { entries: [] }, deletions: null, modifications: null })).toBe(true)
    })

    it('action with nested empty objects across all fields is empty', () => {
      expect(isEmptyChange({ additions: { a: {} }, deletions: { b: [] }, modifications: { c: null } })).toBe(true)
    })

    it('action with real content in additions is NOT empty', () => {
      expect(isEmptyChange({ additions: { entries: [{ name: 'label-a' }] }, deletions: null, modifications: null })).toBe(false)
    })

    it('filters nested-empty results from PR comment output', async () => {
      const { context, createComment } = buildContext()
      const nestedEmptyResult = makeNopResult({
        repo: 'nested-empty-repo',
        plugin: 'labels',
        additions: { entries: [] },
        deletions: { items: [{}] },
        modifications: null
      })
      const settings = buildSettings(context, [nestedEmptyResult])

      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).not.toContain('nested-empty-repo')
      expect(body).toContain('_No changes to apply._')
    })
  })

  // -------------------------------------------------------------------------
  // Test 11 — Base config filtering: org-level rulesets
  // -------------------------------------------------------------------------
  describe('base config filtering for org-level rulesets', () => {
    it('only shows rulesets that changed between base and PR config', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = {
        rulesets: [
          { name: 'Rule A', enforcement: 'active', conditions: { repository_name: { include: ['*'] } } },
          { name: 'Rule B', enforcement: 'active', conditions: { repository_name: { include: ['agent-*'] } } },
          { name: 'Rule C', enforcement: 'evaluate', conditions: { repository_name: { include: ['*'] } } }
        ]
      }
      const prConfig = {
        rulesets: [
          { name: 'Rule A', enforcement: 'active', conditions: { repository_name: { include: ['*'] } } },
          { name: 'Rule B', enforcement: 'active', conditions: { repository_name: { include: ['mythapi-*'] } } }, // changed!
          { name: 'Rule C', enforcement: 'evaluate', conditions: { repository_name: { include: ['*'] } } }
        ]
      }

      // NOP comparison found "changes" for all 3 rulesets (due to API drift)
      const orgResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'test-org (org)',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [{ name: 'Rule B', conditions: { repository_name: { include: ['agent-*'] } } }],
          modifications: [
            { name: 'Rule A', bypass_actors: [{ actor_id: 1 }] },
            { name: 'Rule B', conditions: { repository_name: { include: ['mythapi-*'] } } },
            { name: 'Rule C', bypass_actors: [{ actor_id: 1 }] }
          ]
        }
      }

      const settings = buildSettings(context, [orgResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      // Rule B changed — should appear
      expect(body).toContain('Rule B')
      // Rule A and Rule C are unchanged in config — should NOT appear
      expect(body).not.toContain('Rule A')
      expect(body).not.toContain('Rule C')
    })

    it('shows all rulesets when no baseConfig is provided (fallback)', async () => {
      const { context, createComment } = buildContext()

      const orgResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'test-org (org)',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [],
          modifications: [
            { name: 'Rule A', bypass_actors: [{ actor_id: 1 }] },
            { name: 'Rule B', conditions: { repository_name: { include: ['mythapi-*'] } } }
          ]
        }
      }

      // No baseConfig — should show everything (no filtering)
      const settings = buildSettings(context, [orgResult], { rulesets: [] })
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('Rule A')
      expect(body).toContain('Rule B')
    })

    it('filters out org result entirely when no rulesets changed', async () => {
      const { context, createComment } = buildContext()

      const sameRulesets = [
        { name: 'Rule A', enforcement: 'active' },
        { name: 'Rule B', enforcement: 'evaluate' }
      ]
      const baseConfig = { rulesets: sameRulesets }
      const prConfig = { rulesets: sameRulesets }

      const orgResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'test-org (org)',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [],
          modifications: [
            { name: 'Rule A', bypass_actors: [{ actor_id: 1 }] },
            { name: 'Rule B', bypass_actors: [{ actor_id: 1 }] }
          ]
        }
      }

      const settings = buildSettings(context, [orgResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('_No changes to apply._')
    })
  })

  // -------------------------------------------------------------------------
  // Test 12 — Base config filtering: repo-level results
  // -------------------------------------------------------------------------
  describe('base config filtering for repo-level results', () => {
    it('filters out repo results when their config section did not change', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = {
        rulesets: [
          { name: 'Org Rule', conditions: { repository_name: { include: ['agent-*'] } } }
        ],
        labels: [{ name: 'bug', color: 'red' }]
      }
      const prConfig = {
        rulesets: [
          { name: 'Org Rule', conditions: { repository_name: { include: ['mythapi-*'] } } } // changed
        ],
        labels: [{ name: 'bug', color: 'red' }] // unchanged
      }

      // Repo-level labels result — labels section didn't change
      const repoLabelsResult = makeNopResult({
        repo: 'my-repo',
        plugin: 'labels',
        additions: ['stale-label']
      })

      // Org-level rulesets result — rulesets section DID change
      const orgResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'test-org (org)',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [],
          modifications: [{ name: 'Org Rule', conditions: { repository_name: { include: ['mythapi-*'] } } }]
        }
      }

      const settings = buildSettings(context, [repoLabelsResult, orgResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      // Org rulesets should show
      expect(body).toContain('Org Rule')
      // Repo labels should NOT show (labels section unchanged)
      expect(body).not.toContain('my-repo')
    })

    it('shows repo results when their config section DID change', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = { labels: [{ name: 'bug', color: 'red' }] }
      const prConfig = { labels: [{ name: 'bug', color: 'blue' }] } // changed!

      const repoLabelsResult = makeNopResult({
        repo: 'affected-repo',
        plugin: 'labels',
        additions: [],
        modifications: [{ name: 'bug', color: 'blue' }]
      })

      const settings = buildSettings(context, [repoLabelsResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('affected-repo')
    })

    it('preserves ERROR results regardless of config filtering', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = { labels: [{ name: 'bug', color: 'red' }] }
      const prConfig = { labels: [{ name: 'bug', color: 'red' }] } // unchanged

      const errorResult = makeErrorResult({ repo: 'error-repo', plugin: 'labels', msg: 'API failure' })

      const settings = buildSettings(context, [errorResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('error-repo')
      expect(body).toContain('API failure')
    })

    it('filters out repo-level rulesets even when org rulesets section changed', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = {
        rulesets: [{ name: 'Org Rule', conditions: { repository_name: { include: ['agent-*'] } } }]
      }
      const prConfig = {
        rulesets: [{ name: 'Org Rule', conditions: { repository_name: { include: ['mythapi-*'] } } }]
      }

      // Repo-level rulesets result (from override file, not global config)
      const repoRulesetsResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'some-repo',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [],
          modifications: [{ name: 'repo-lvl-rule', enforcement: 'active' }]
        }
      }

      const settings = buildSettings(context, [repoRulesetsResult], prConfig, baseConfig)
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      // Repo-level rulesets should be filtered (override file didn't change)
      expect(body).not.toContain('some-repo')
    })

    it('keeps repo-level results when repo is in changedRepoNames', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = { labels: [{ name: 'bug', color: 'red' }] }
      const prConfig = { labels: [{ name: 'bug', color: 'red' }] } // unchanged globally

      // Repo-level result for a repo whose override file changed
      const repoResult = makeNopResult({
        repo: 'changed-repo',
        plugin: 'labels',
        modifications: [{ name: 'bug', color: 'green' }]
      })

      const settings = buildSettings(context, [repoResult], prConfig, baseConfig)
      // Simulate syncSelectedSettings — this repo had its override file changed
      settings.changedRepoNames = new Set(['changed-repo'])
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('changed-repo')
    })

    it('filters repo-level rulesets but keeps repo in changedRepoNames', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = {
        rulesets: [{ name: 'Org Rule', enforcement: 'active' }]
      }
      const prConfig = {
        rulesets: [{ name: 'Org Rule', enforcement: 'active' }]
      }

      // Two repos: one selected (override changed), one not
      const selectedRepoResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'selected-repo',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [],
          modifications: [{ name: 'repo-rule', enforcement: 'active' }]
        }
      }
      const driftRepoResult = {
        type: 'NOP',
        plugin: 'Rulesets',
        repo: 'drift-repo',
        endpoint: '',
        body: {},
        action: {
          additions: [],
          deletions: [],
          modifications: [{ name: 'other-rule', enforcement: 'evaluate' }]
        }
      }

      const settings = buildSettings(context, [selectedRepoResult, driftRepoResult], prConfig, baseConfig)
      settings.changedRepoNames = new Set(['selected-repo'])
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('selected-repo')
      expect(body).not.toContain('drift-repo')
    })

    it('keeps repo-level results for repos affected by changed suborg files', async () => {
      const { context, createComment } = buildContext()

      const baseConfig = { labels: [{ name: 'bug', color: 'red' }] }
      const prConfig = { labels: [{ name: 'bug', color: 'red' }] }

      const repoResult = makeNopResult({
        repo: 'suborg-repo',
        plugin: 'labels',
        modifications: [{ name: 'bug', color: 'green' }]
      })

      const settings = buildSettings(context, [repoResult], prConfig, baseConfig)
      settings.setChangedConfigTargets([], [{ path: '.github/suborgs/engineering.yml' }])
      settings.subOrgConfigs = {
        'suborg-repo': { source: '.github/suborgs/engineering.yml' },
        'other-repo': { source: '.github/suborgs/other.yml' }
      }

      settings.trackChangedReposFromSubOrgConfigs()
      await settings.handleResults()

      const body = getCombinedCommentBody(createComment)
      expect(body).toContain('suborg-repo')
      expect(body).not.toContain('other-repo')
    })
  })

  // -------------------------------------------------------------------------
  // Test 13 — getChangedEntryNames helper
  // -------------------------------------------------------------------------
  describe('getChangedEntryNames', () => {
    const { getChangedEntryNames } = require('../../../lib/settings')

    it('returns empty set when both arrays are identical', () => {
      const entries = [{ name: 'A', val: 1 }, { name: 'B', val: 2 }]
      expect(getChangedEntryNames(entries, entries).size).toBe(0)
    })

    it('detects added entries', () => {
      const base = [{ name: 'A', val: 1 }]
      const pr = [{ name: 'A', val: 1 }, { name: 'B', val: 2 }]
      const changed = getChangedEntryNames(base, pr)
      expect(changed.has('B')).toBe(true)
      expect(changed.has('A')).toBe(false)
    })

    it('detects deleted entries', () => {
      const base = [{ name: 'A', val: 1 }, { name: 'B', val: 2 }]
      const pr = [{ name: 'A', val: 1 }]
      const changed = getChangedEntryNames(base, pr)
      expect(changed.has('B')).toBe(true)
      expect(changed.has('A')).toBe(false)
    })

    it('detects modified entries', () => {
      const base = [{ name: 'A', val: 1 }, { name: 'B', val: 2 }]
      const pr = [{ name: 'A', val: 1 }, { name: 'B', val: 99 }]
      const changed = getChangedEntryNames(base, pr)
      expect(changed.has('B')).toBe(true)
      expect(changed.has('A')).toBe(false)
    })

    it('handles null/undefined base gracefully', () => {
      const pr = [{ name: 'A' }, { name: 'B' }]
      const changed = getChangedEntryNames(null, pr)
      expect(changed.has('A')).toBe(true)
      expect(changed.has('B')).toBe(true)
    })

    it('handles null/undefined PR gracefully', () => {
      const base = [{ name: 'A' }, { name: 'B' }]
      const changed = getChangedEntryNames(base, null)
      expect(changed.has('A')).toBe(true)
      expect(changed.has('B')).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Test 14 — filterActionByChangedNames helper
  // -------------------------------------------------------------------------
  describe('filterActionByChangedNames', () => {
    const { filterActionByChangedNames } = require('../../../lib/settings')

    it('keeps entries matching changed names', () => {
      const action = {
        additions: [{ name: 'New Rule', enforcement: 'active' }],
        deletions: [{ name: 'Old Rule', enforcement: 'evaluate' }],
        modifications: [
          { name: 'Changed Rule', conditions: { include: ['*'] } },
          { name: 'Unchanged Rule', bypass_actors: [{ actor_id: 1 }] }
        ]
      }
      const changed = new Set(['New Rule', 'Old Rule', 'Changed Rule'])
      const result = filterActionByChangedNames(action, changed)

      expect(result.additions).toHaveLength(1)
      expect(result.deletions).toHaveLength(1)
      expect(result.modifications).toHaveLength(1)
      expect(result.modifications[0].name).toBe('Changed Rule')
    })

    it('returns null when all entries are filtered out', () => {
      const action = {
        additions: [],
        deletions: [],
        modifications: [
          { name: 'Noise A', bypass_actors: [{ actor_id: 1 }] },
          { name: 'Noise B', bypass_actors: [{ actor_id: 2 }] }
        ]
      }
      const changed = new Set(['Something Else'])
      const result = filterActionByChangedNames(action, changed)
      expect(result).toBeNull()
    })

    it('keeps entries without a name field (structural entries)', () => {
      const action = {
        additions: [],
        deletions: [{ conditions: { repository_name: { include: ['old-*'] } } }], // no name field
        modifications: []
      }
      const changed = new Set(['Rule X'])
      const result = filterActionByChangedNames(action, changed)
      expect(result.deletions).toHaveLength(1)
    })
  })
})
