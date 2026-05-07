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

function buildSettings (context, results = []) {
  const settings = new Settings(
    /* nop */ true,
    context,
    { owner: 'test-org', repo: 'admin' },
    /* config */ {},
    /* ref */ 'main'
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
  // Test 7 — org-level result rows retain (org) labeling
  // -------------------------------------------------------------------------
  describe('org-level labeling', () => {
    it('includes repos tagged with (org) in output', async () => {
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
      expect(body).toContain('test-org (org)')
    })
  })

  // -------------------------------------------------------------------------
  // Test 8 — does not create PR comment when CREATE_PR_COMMENT is not true
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
})
