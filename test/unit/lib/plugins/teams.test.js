const { when } = require('jest-when')
const any = require('@travi/any')
const Teams = require('../../../../lib/plugins/teams')

describe('Teams', () => {
  let github
  const addedTeamName = 'added'
  const addedTeamId = any.integer()
  const updatedTeamName = 'updated-permission'
  const updatedTeamId = any.integer()
  const removedTeamName = 'removed'
  const removedTeamId = any.integer()
  const unchangedTeamName = 'unchanged'
  const unchangedTeamId = any.integer()
  const org = 'bkeepers'

  function configure (config) {
    const log = { debug: jest.fn(), error: console.error, warn: console.warn }
    const errors = []
    return new Teams(undefined, github, { owner: 'bkeepers', repo: 'test' }, config, log, errors)
  }

  beforeEach(() => {
    github = {
      paginate: jest.fn()
        .mockImplementation(async (fetch, params) => {
          if (typeof fetch !== 'function') {
            return []
          }
          const response = await fetch(params)
          return response.data
        }),
      rest: {
        teams: {
          create: jest.fn().mockResolvedValue(),
          getByName: jest.fn(),
          addOrUpdateRepoPermissionsInOrg: jest.fn().mockResolvedValue()
        },
        repos: {
          listTeams: jest.fn().mockResolvedValue({
            data: [
              { id: unchangedTeamId, slug: unchangedTeamName, permission: 'push' },
              { id: removedTeamId, slug: removedTeamName, permission: 'push' },
              { id: updatedTeamId, slug: updatedTeamName, permission: 'pull' }
            ]
          })
        }
      },
      request: Object.assign(jest.fn().mockResolvedValue(), {
        endpoint: jest.fn().mockReturnValue({})
      })
    }
  })

  describe('sync', () => {
    it('syncs teams', async () => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' },
        { name: updatedTeamName, permission: 'admin' },
        { name: addedTeamName, permission: 'pull' }
      ])

      when(github.rest.teams.getByName)
        .defaultResolvedValue({})
        .calledWith({ org: 'bkeepers', team_slug: addedTeamName })
        .mockResolvedValue({ data: { id: addedTeamId } })

      await plugin.sync()

      expect(github.request).toHaveBeenCalledWith(
        'PUT /orgs/:owner/teams/:team_slug/repos/:owner/:repo',
        {
          org,
          owner: org,
          repo: 'test',
          team_id: updatedTeamId,
          team_slug: updatedTeamName,
          permission: 'admin'
        }
      )

      expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
        org,
        team_id: addedTeamId,
        team_slug: addedTeamName,
        owner: org,
        repo: 'test',
        permission: 'pull'
      })

      expectTeamDeleted(removedTeamName)
    })

    function expectTeamDeleted (teamSlug) {
      expect(github.request).toHaveBeenCalledWith(
        'DELETE /orgs/:owner/teams/:team_slug/repos/:owner/:repo',
        {
          org,
          owner: org,
          repo: 'test',
          team_slug: teamSlug
        }
      )
    }
  })

  describe('filtering teams by include/exclude', () => {
    beforeEach(() => {
      github.rest.repos.listTeams.mockResolvedValue({ data: [] })
    })

    it('does not add a team when the repo matches an exclude glob', async () => {
      const plugin = configure([
        { name: addedTeamName, permission: 'pull', exclude: ['test*'] }
      ])

      await plugin.sync()

      expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
    })

    it('does not add a team when the repo is not in an include glob', async () => {
      const plugin = configure([
        { name: addedTeamName, permission: 'pull', include: ['other-*'] }
      ])

      await plugin.sync()

      expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
    })

    it('adds a team when the repo matches an include glob', async () => {
      when(github.rest.teams.getByName)
        .calledWith({ org, team_slug: addedTeamName })
        .mockResolvedValue({ data: { id: addedTeamId } })

      const plugin = configure([
        { name: addedTeamName, permission: 'pull', include: ['test*'] }
      ])

      await plugin.sync()

      expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
        org,
        team_id: addedTeamId,
        team_slug: addedTeamName,
        owner: org,
        repo: 'test',
        permission: 'pull'
      })
    })
  })

  describe('external_group linking', () => {
    const externalGroupName = 'Engineering - Expert Services'
    const externalGroupId = 42

    beforeEach(() => {
      // request: default to no-current-link (404) so PATCH fires; override per-test as needed.
      github.request = jest.fn().mockImplementation((endpoint) => {
        if (typeof endpoint === 'string' && endpoint.startsWith('GET /orgs/{org}/teams/')) {
          const err = new Error('not found')
          err.status = 404
          return Promise.reject(err)
        }
        return Promise.resolve({ data: {} })
      })
      github.request.endpoint = jest.fn().mockReturnValue('endpoint-stub')

      // paginate: route the external-groups list call to a single page; keep
      // the original implementation for other paginated endpoints. The real
      // production code passes a map-function (3rd arg) that extracts the
      // `groups` array from each page response -- we mimic the same response
      // shape so that mapFn gets exercised.
      const externalGroupsResponse = {
        data: {
          total_count: 2,
          groups: [
            { group_id: externalGroupId, group_name: externalGroupName },
            { group_id: 99, group_name: 'Some Other Group' }
          ]
        }
      }
      github.paginate = jest.fn().mockImplementation(async (fetchOrEndpoint, params, mapFn) => {
        if (fetchOrEndpoint === 'GET /orgs/{org}/external-groups') {
          if (typeof mapFn === 'function') {
            return mapFn(externalGroupsResponse)
          }
          return externalGroupsResponse.data.groups
        }
        if (typeof fetchOrEndpoint === 'function') {
          const response = await fetchOrEndpoint()
          return response.data
        }
        return []
      })
    })

    it('looks up the group id by name and PATCHes the team link', async () => {
      when(github.rest.teams.getByName)
        .defaultResolvedValue({})
        .calledWith({ org, team_slug: addedTeamName })
        .mockResolvedValue({ data: { id: addedTeamId } })

      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' },
        { name: addedTeamName, permission: 'pull', external_group: externalGroupName }
      ])

      await plugin.sync()

      expect(github.paginate).toHaveBeenCalledWith(
        'GET /orgs/{org}/external-groups',
        { org, per_page: 100 },
        expect.any(Function)
      )
      expect(github.request).toHaveBeenCalledWith(
        'PATCH /orgs/{org}/teams/{team_slug}/external-groups',
        { org, team_slug: addedTeamName, group_id: externalGroupId }
      )
      expect(plugin.hasChanges).toBe(true)
    })

    it('skips the PATCH when the team is already linked to the same group', async () => {
      github.request = jest.fn().mockImplementation((endpoint, params) => {
        if (endpoint === 'GET /orgs/{org}/teams/{team_slug}/external-groups') {
          return Promise.resolve({ data: { groups: [{ group_id: externalGroupId, group_name: externalGroupName }] } })
        }
        return Promise.resolve({ data: {} })
      })
      github.request.endpoint = jest.fn().mockReturnValue('endpoint-stub')

      const plugin = configure([
        { name: unchangedTeamName, permission: 'push', external_group: externalGroupName }
      ])

      await plugin.sync()

      expect(github.request).toHaveBeenCalledWith(
        'GET /orgs/{org}/teams/{team_slug}/external-groups',
        { org, team_slug: unchangedTeamName }
      )
      expect(github.request).not.toHaveBeenCalledWith(
        'PATCH /orgs/{org}/teams/{team_slug}/external-groups',
        expect.anything()
      )
    })

    it('logs a warning (not an error) and skips when the external group name is not found', async () => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push', external_group: 'Nonexistent Group' }
      ])

      await plugin.sync()

      expect(github.request).not.toHaveBeenCalledWith(
        'PATCH /orgs/{org}/teams/{team_slug}/external-groups',
        expect.anything()
      )
      // Non-fatal: should not push onto the errors array
      expect(plugin.errors.some(e => /Nonexistent Group/.test(JSON.stringify(e)))).toBe(false)
    })

    it('in nop mode, emits a WARNING NopCommand when the external group is not found (so it appears in the PR check_run without failing it)', async () => {
      const log = { debug: jest.fn(), error: console.error, warn: console.warn }
      const errors = []
      const Teams = require('../../../../lib/plugins/teams')
      const plugin = new Teams(true, github, { owner: org, repo: 'test' }, [
        { name: unchangedTeamName, permission: 'push', external_group: 'Nonexistent Group' }
      ], log, errors)

      const result = await plugin.sync()

      expect(Array.isArray(result)).toBe(true)
      const warningCmd = result.find(c => c && c.type === 'WARNING' && /Nonexistent Group/.test(JSON.stringify(c)))
      expect(warningCmd).toBeDefined()
      expect(result.some(c => c && c.type === 'ERROR')).toBe(false)
      expect(github.request).not.toHaveBeenCalledWith(
        'PATCH /orgs/{org}/teams/{team_slug}/external-groups',
        expect.anything()
      )
    })

    it('paginates the external-groups list only once per org across multiple syncs sharing the github client', async () => {
      when(github.rest.teams.getByName)
        .defaultResolvedValue({})
        .calledWith({ org, team_slug: addedTeamName })
        .mockResolvedValue({ data: { id: addedTeamId } })

      const plugin1 = configure([
        { name: unchangedTeamName, permission: 'push', external_group: externalGroupName }
      ])
      const plugin2 = configure([
        { name: addedTeamName, permission: 'pull', external_group: externalGroupName }
      ])

      await plugin1.sync()
      await plugin2.sync()

      const listCalls = github.paginate.mock.calls.filter(c => c[0] === 'GET /orgs/{org}/external-groups')
      expect(listCalls).toHaveLength(1)
    })

    it('does not call the external-groups list endpoint when no entry uses external_group', async () => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' }
      ])

      await plugin.sync()

      const listCalls = github.paginate.mock.calls.filter(c => c[0] === 'GET /orgs/{org}/external-groups')
      expect(listCalls).toHaveLength(0)
    })

    it('in nop mode, emits a NopCommand and makes no PATCH', async () => {
      const log = { debug: jest.fn(), error: console.error }
      const errors = []
      const Teams = require('../../../../lib/plugins/teams')
      const plugin = new Teams(true, github, { owner: org, repo: 'test' }, [
        { name: unchangedTeamName, permission: 'push', external_group: externalGroupName }
      ], log, errors)

      const result = await plugin.sync()

      expect(Array.isArray(result)).toBe(true)
      expect(result.some(c => /external group/.test(c.action) || /external group/.test(JSON.stringify(c)))).toBe(true)
      // In nop mode no real linkage should be performed -- neither the
      // idempotency GET nor the PATCH should hit the team-external-groups
      // endpoint.
      expect(github.request).not.toHaveBeenCalledWith(
        'PATCH /orgs/{org}/teams/{team_slug}/external-groups',
        expect.anything()
      )
      expect(github.request).not.toHaveBeenCalledWith(
        'GET /orgs/{org}/teams/{team_slug}/external-groups',
        expect.anything()
      )
    })
  })
})
