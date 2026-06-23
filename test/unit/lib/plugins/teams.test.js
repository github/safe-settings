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

  // The repo name used by configure() is 'test'.  All exclude/include patterns
  // below are written relative to that name so the intent of each case is clear.
  describe('exclude/include filtering', () => {
    // Use an empty existing-teams list so these tests only exercise additions
    // (or the absence of them) without interacting with the remove/update paths.
    beforeEach(() => {
      github.rest.repos.listTeams.mockResolvedValue({ data: [] })
    })

    describe('exclude', () => {
      it('does not apply a team when the repo name exactly matches an exclude entry', async () => {
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', exclude: ['test'] }
        ])

        await plugin.sync()

        expect(github.rest.teams.getByName).not.toHaveBeenCalled()
        expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
      })

      it('applies a team when the repo name does not match any exclude entry', async () => {
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', exclude: ['other-*'] }
        ])

        when(github.rest.teams.getByName)
          .defaultResolvedValue({})
          .calledWith({ org, team_slug: addedTeamName })
          .mockResolvedValue({ data: { id: addedTeamId } })

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

      it('does not pass the exclude property to the GitHub API', async () => {
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', exclude: ['other-*'] }
        ])

        when(github.rest.teams.getByName)
          .defaultResolvedValue({})
          .calledWith({ org, team_slug: addedTeamName })
          .mockResolvedValue({ data: { id: addedTeamId } })

        await plugin.sync()

        const callArgs = github.rest.teams.addOrUpdateRepoPermissionsInOrg.mock.calls[0][0]
        expect(callArgs).not.toHaveProperty('exclude')
      })

      it('supports minimatch glob wildcards in exclude patterns', async () => {
        // 'test*' matches the current repo 'test'
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', exclude: ['test*'] }
        ])

        await plugin.sync()

        expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
      })

      it('removes an existing team grant when the team entry is excluded for this repo', async () => {
        // The team is already applied; with exclude matching, safe-settings treats the
        // entry as absent for this repo, so the existing grant is revoked.
        github.rest.repos.listTeams.mockResolvedValue({
          data: [{ id: unchangedTeamId, slug: unchangedTeamName, permission: 'push' }]
        })

        const plugin = configure([
          { name: unchangedTeamName, permission: 'push', exclude: ['test'] }
        ])

        await plugin.sync()

        expect(github.request).toHaveBeenCalledWith(
          'DELETE /orgs/:owner/teams/:team_slug/repos/:owner/:repo',
          {
            org,
            owner: org,
            repo: 'test',
            team_slug: unchangedTeamName
          }
        )
      })
    })

    describe('include', () => {
      it('applies a team when the repo name exactly matches an include entry', async () => {
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', include: ['test'] }
        ])

        when(github.rest.teams.getByName)
          .defaultResolvedValue({})
          .calledWith({ org, team_slug: addedTeamName })
          .mockResolvedValue({ data: { id: addedTeamId } })

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

      it('does not apply a team when the repo name does not match any include entry', async () => {
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', include: ['other-repo'] }
        ])

        await plugin.sync()

        expect(github.rest.teams.getByName).not.toHaveBeenCalled()
        expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).not.toHaveBeenCalled()
      })

      it('does not pass the include property to the GitHub API', async () => {
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', include: ['test'] }
        ])

        when(github.rest.teams.getByName)
          .defaultResolvedValue({})
          .calledWith({ org, team_slug: addedTeamName })
          .mockResolvedValue({ data: { id: addedTeamId } })

        await plugin.sync()

        const callArgs = github.rest.teams.addOrUpdateRepoPermissionsInOrg.mock.calls[0][0]
        expect(callArgs).not.toHaveProperty('include')
      })

      it('supports minimatch glob wildcards in include patterns', async () => {
        // 'test*' matches the current repo 'test'
        const plugin = configure([
          { name: addedTeamName, permission: 'pull', include: ['test*'] }
        ])

        when(github.rest.teams.getByName)
          .defaultResolvedValue({})
          .calledWith({ org, team_slug: addedTeamName })
          .mockResolvedValue({ data: { id: addedTeamId } })

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

      it('removes an existing team grant when this repo is not in the include list', async () => {
        // The team is already applied; the include list does not contain this repo,
        // so safe-settings treats the entry as absent and revokes the grant.
        github.rest.repos.listTeams.mockResolvedValue({
          data: [{ id: unchangedTeamId, slug: unchangedTeamName, permission: 'push' }]
        })

        const plugin = configure([
          { name: unchangedTeamName, permission: 'push', include: ['other-repo'] }
        ])

        await plugin.sync()

        expect(github.request).toHaveBeenCalledWith(
          'DELETE /orgs/:owner/teams/:team_slug/repos/:owner/:repo',
          {
            org,
            owner: org,
            repo: 'test',
            team_slug: unchangedTeamName
          }
        )
      })
    })
  })
})
