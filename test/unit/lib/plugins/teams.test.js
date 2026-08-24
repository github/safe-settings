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
    const log = { debug: jest.fn(), info: jest.fn(), error: console.error }
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
})
