const { when } = require('jest-when')
const any = require('@travi/any')
const Teams = require('../../../../lib/plugins/teams')

describe('Teams', () => {
  let github
  const addedTeamName = 'added'
  const addedTeamId = any.integer()
  const securityManagerRoleId = any.integer()
  const securityManagerTeamName = 'security-managers'
  const securityManagerTeamId = any.integer()
  const updatedTeamName = 'updated-permission'
  const updatedTeamId = any.integer()
  const removedTeamName = 'removed'
  const removedTeamId = any.integer()
  const unchangedTeamName = 'unchanged'
  const unchangedTeamId = any.integer()
  const org = 'bkeepers'
  const organizationRolesRoute = 'GET /orgs/{org}/organization-roles'
  const organizationRoleTeamsRoute = 'GET /orgs/{org}/organization-roles/{role_id}/teams'
  const roleFailureStatuses = [403, 404, 422, 500]
  const repoTeams = [
    { id: securityManagerTeamId, slug: securityManagerTeamName, name: 'Security Managers', permission: 'admin' },
    { id: unchangedTeamId, slug: unchangedTeamName, permission: 'push' },
    { id: removedTeamId, slug: removedTeamName, permission: 'push' },
    { id: updatedTeamId, slug: updatedTeamName, permission: 'pull' }
  ]

  function configure (config) {
    const log = { debug: jest.fn(), error: jest.fn() }
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
            data: repoTeams
          })
        }
      },
      request: Object.assign(jest.fn().mockResolvedValue(), {
        endpoint: jest.fn().mockReturnValue({})
      })
    }
  })

  describe('sync', () => {
    it('syncs non-security-manager teams and leaves security manager teams untouched', async () => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' },
        { name: updatedTeamName, permission: 'admin' },
        { name: addedTeamName, permission: 'pull' }
      ])

      when(github.paginate)
        .calledWith(organizationRolesRoute, { org })
        .mockResolvedValue({ roles: [{ id: securityManagerRoleId, name: 'Security Manager' }] })

      when(github.paginate)
        .calledWith(organizationRoleTeamsRoute, { org, role_id: securityManagerRoleId })
        .mockResolvedValue({ teams: [{ slug: securityManagerTeamName, name: 'Security Managers' }] })

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

      expect(github.paginate).toHaveBeenCalledWith(organizationRolesRoute, { org })
      expect(github.paginate).toHaveBeenCalledWith(organizationRoleTeamsRoute, { org, role_id: securityManagerRoleId })
      expectTeamDeleted(removedTeamName)
      expectTeamNotDeleted(securityManagerTeamName)
    })

    it.each(roleFailureStatuses)('skips deletions when organization role lookup fails with %s', async status => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' }
      ])

      when(github.paginate)
        .calledWith(organizationRolesRoute, { org })
        .mockRejectedValue({ status })

      await plugin.sync()

      expectNoTeamsDeleted()
    })

    it.each(roleFailureStatuses)('skips deletions when organization role team lookup fails with %s', async status => {
      const plugin = configure([
        { name: unchangedTeamName, permission: 'push' }
      ])

      when(github.paginate)
        .calledWith(organizationRolesRoute, { org })
        .mockResolvedValue({ roles: [{ id: securityManagerRoleId, slug: 'security_manager' }] })

      when(github.paginate)
        .calledWith(organizationRoleTeamsRoute, { org, role_id: securityManagerRoleId })
        .mockRejectedValue({ status })

      await plugin.sync()

      expectNoTeamsDeleted()
    })

    it('matches configured team names to existing slugs without add or remove churn', async () => {
      const formattedTeamName = 'Platform & Security!'

      github.rest.repos.listTeams.mockResolvedValue({
        data: [{ id: unchangedTeamId, slug: 'platform-security', name: formattedTeamName, permission: 'push' }]
      })

      const plugin = configure([
        { name: formattedTeamName, permission: 'push' }
      ])

      await plugin.sync()

      expect(github.rest.teams.getByName).not.toHaveBeenCalled()
      expectNoTeamsDeleted()
    })

    it('matches security manager team names against repository team slugs', async () => {
      github.rest.repos.listTeams.mockResolvedValue({
        data: [{ id: securityManagerTeamId, slug: securityManagerTeamName, permission: 'admin' }]
      })

      when(github.paginate)
        .calledWith(organizationRolesRoute, { org })
        .mockResolvedValue({ roles: [{ id: securityManagerRoleId, name: 'Security Manager' }] })

      when(github.paginate)
        .calledWith(organizationRoleTeamsRoute, { org, role_id: securityManagerRoleId })
        .mockResolvedValue({ teams: [{ name: 'Security Managers' }] })

      const plugin = configure([])

      await expect(plugin.find()).resolves.toEqual([])
    })

    it('uses normalized team slugs when adding configured team names', async () => {
      const formattedTeamName = 'Platform & Security!'

      github.rest.repos.listTeams.mockResolvedValue({ data: [] })

      when(github.rest.teams.getByName)
        .calledWith({ org, team_slug: 'platform-security' })
        .mockResolvedValue({ data: { id: addedTeamId, slug: 'platform-security' } })

      const plugin = configure([
        { name: formattedTeamName, permission: 'pull' }
      ])

      await plugin.sync()

      expect(github.rest.teams.addOrUpdateRepoPermissionsInOrg).toHaveBeenCalledWith({
        org,
        team_id: addedTeamId,
        team_slug: 'platform-security',
        owner: org,
        repo: 'test',
        permission: 'pull'
      })
    })

    it('returns original teams when the security manager role is absent', async () => {
      const plugin = configure([])

      when(github.paginate)
        .calledWith(organizationRolesRoute, { org })
        .mockResolvedValue({ roles: [{ id: any.integer(), name: 'compliance_manager' }] })

      await expect(plugin.find()).resolves.toEqual(repoTeams)
      expect(github.paginate).not.toHaveBeenCalledWith(organizationRoleTeamsRoute, { org, role_id: securityManagerRoleId })
    })

    it('returns original teams when organization role team lookup fails', async () => {
      const plugin = configure([])

      when(github.paginate)
        .calledWith(organizationRolesRoute, { org })
        .mockResolvedValue({ roles: [{ id: securityManagerRoleId, slug: 'security_manager' }] })

      when(github.paginate)
        .calledWith(organizationRoleTeamsRoute, { org, role_id: securityManagerRoleId })
        .mockRejectedValue({ status: 500 })

      await expect(plugin.find()).resolves.toEqual(repoTeams)
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

    function expectTeamNotDeleted (teamSlug) {
      expect(github.request).not.toHaveBeenCalledWith(
        'DELETE /orgs/:owner/teams/:team_slug/repos/:owner/:repo',
        {
          org,
          owner: org,
          repo: 'test',
          team_slug: teamSlug
        }
      )
    }

    function expectNoTeamsDeleted () {
      expect(github.request).not.toHaveBeenCalledWith(
        'DELETE /orgs/:owner/teams/:team_slug/repos/:owner/:repo',
        expect.any(Object)
      )
    }
  })
})
