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
    const log = { debug: jest.fn(), error: console.error }
    return new Teams(undefined, github, { owner: 'bkeepers', repo: 'test' }, config, log)
  }

  beforeEach(() => {
    github = {
      paginate: jest.fn().mockResolvedValue(),
      teams: {
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
      },
      request: jest.fn()
    }
  })

  describe('sync', () => {
    it('syncs teams', async () => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' },
        { name: updatedTeamName, permission: 'admin' },
        { name: addedTeamName, permission: 'pull' }
      ])

      when(github.teams.getByName)
        .defaultResolvedValue({})
        .calledWith({ org: 'bkeepers', team_slug: addedTeamName })
        .mockResolvedValue({ data: { id: addedTeamId } })

      await plugin.sync()

      expect(github.request).toHaveBeenCalledWith(
        'PUT /teams/:team_id/repos/:owner/:repo',
        {
          org,
          owner: org,
          repo: 'test',
          team_id: updatedTeamId,
          team_slug: updatedTeamName,
          permission: 'admin'
        }
      )

      expect(github.teams.addOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
        org,
        team_id: addedTeamId,
        team_slug: addedTeamName,
        owner: org,
        repo: 'test',
        permission: 'pull'
      })

      expectTeamDeleted(removedTeamId)
    })

    it('removes all teams', async () => {
      const plugin = configure([])

      await plugin.sync()

      expectTeamDeleted(removedTeamId)
      expectTeamDeleted(unchangedTeamId)
      expectTeamDeleted(updatedTeamId)
    })

    function expectTeamDeleted(teamId) {
      expect(github.request).toHaveBeenCalledWith(
        'DELETE /teams/:team_id/repos/:owner/:repo',
        {
          org,
          owner: org,
          repo: 'test',
          team_id: teamId
        }
      )
    }
  })
})
