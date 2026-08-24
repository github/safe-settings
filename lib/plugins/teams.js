const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

const teamRepoEndpoint = '/orgs/:owner/teams/:team_slug/repos/:owner/:repo'
const securityManagerRoleName = 'security_manager'
const safeSecurityManagerStatuses = [403, 404, 422]
module.exports = class Teams extends Diffable {
  async find () {
    this.skipTeamDeletion = false
    this.log.debug(`Finding teams for ${this.repo.owner}/${this.repo.repo}`)
    return this.github.paginate(this.github.rest.repos.listTeams, this.repo).then(res => {
      this.log.debug(`Found teams ${JSON.stringify(res)}`)
      return this.checkSecurityManager(res)
    })
  }

  // remove all security manager teams
  async checkSecurityManager (teams) {
    try {
      this.log.debug('Removing all security manager teams since they should not be handled here')
      this.log.debug(`Calling API to get organization roles ${JSON.stringify(this.github.request.endpoint('GET /orgs/{org}/organization-roles',
        {
          org: this.repo.owner
        }))} `)
      const rolesResp = await this.github.paginate('GET /orgs/{org}/organization-roles',
        { org: this.repo.owner })
      const roles = this.toArray(rolesResp, 'roles')
      const securityManagerRole = roles.find(role => this.isSecurityManagerRole(role))

      if (!securityManagerRole || !securityManagerRole.id) {
        this.log.debug(`${this.repo.owner} Org does not have a security manager organization role set up`)
        return teams
      }

      const params = {
        org: this.repo.owner,
        role_id: securityManagerRole.id
      }
      this.log.debug(`Calling API to get security manager teams ${JSON.stringify(this.github.request.endpoint('GET /orgs/{org}/organization-roles/{role_id}/teams', params))} `)
      const resp = await this.github.paginate('GET /orgs/{org}/organization-roles/{role_id}/teams', params)

      this.log.debug(`Response from the call is ${JSON.stringify(resp)}`)
      const securityManagerTeams = this.toArray(resp, 'teams')
      const securityManagerTeamIdentifiers = new Set(securityManagerTeams.flatMap(team => [team.slug, team.name].map(name => this.normalizeTeamIdentifier(name))).filter(Boolean))

      return teams.filter(team => !this.isSecurityManagerTeam(team, securityManagerTeamIdentifiers))
    } catch (e) {
      this.skipTeamDeletion = true
      const status = e && e.status
      if (safeSecurityManagerStatuses.includes(status)) {
        this.log.debug(`${this.repo.owner} Org security manager teams could not be fetched with status ${status}; keeping repository teams unchanged ${e}`)
      } else {
        this.log.error(
        `Unexpected error when fetching security manager teams for org ${this.repo.owner}; keeping repository teams unchanged ${e}`
        )
      }
      return teams
    }
  }

  toArray (resp, propertyName) {
    if (Array.isArray(resp)) {
      return resp
    }

    if (resp && Array.isArray(resp[propertyName])) {
      return resp[propertyName]
    }

    return []
  }

  isSecurityManagerRole (role) {
    return [role && role.name, role && role.slug]
      .map(name => this.normalizeRoleName(name))
      .includes(securityManagerRoleName)
  }

  normalizeRoleName (name) {
    if (typeof name !== 'string') {
      return ''
    }

    return name.trim().toLowerCase().replace(/[\s-]+/g, '_')
  }

  normalizeTeamIdentifier (name) {
    if (typeof name !== 'string') {
      return ''
    }

    return name.trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  isSecurityManagerTeam (team, securityManagerTeamIdentifiers) {
    return [team.slug, team.name]
      .map(name => this.normalizeTeamIdentifier(name))
      .filter(Boolean)
      .some(name => securityManagerTeamIdentifiers.has(name))
  }

  comparator (existing, attrs) {
    return this.normalizeTeamIdentifier(existing.slug || existing.name) === this.normalizeTeamIdentifier(attrs.name)
  }

  changed (existing, attrs) {
    return existing.permission !== attrs.permission
  }

  update (existing, attrs) {
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint(`PUT ${teamRepoEndpoint}`, this.toParams(existing, attrs)), 'Add Teams to Repo')
      ])
    }
    return this.github.request(`PUT ${teamRepoEndpoint}`, this.toParams(existing, attrs))
  }

  add (attrs) {
    let existing = { team_id: 1 }
    this.log.debug(`Getting team with the parms ${JSON.stringify(attrs)}`)
    return this.github.rest.teams.getByName({ org: this.repo.owner, team_slug: this.normalizeTeamIdentifier(attrs.name) }).then(res => {
      existing = res.data
      this.log.debug(`adding team ${attrs.name} to repo ${this.repo.repo}`)
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.rest.teams.addOrUpdateRepoPermissionsInOrg.endpoint(this.toParams(existing, attrs)), 'Add Teams to Repo')
        ])
      }
      return this.github.rest.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs)).then(res => {
        this.log.debug(`team added ${res}`)
      }).catch(e => {
        this.logError(`Error adding team to repo ${JSON.stringify(e)} with parms ${JSON.stringify(this.toParams(existing, attrs))}:\n`, e)
      })
    }).catch(e => {
      if (e.status === 404) {
        const createParam = {
          org: this.repo.owner,
          name: attrs.name
        }
        if (attrs.privacy) {
          createParam.privacy = attrs.privacy
        }
        this.log.debug(`Creating teams ${JSON.stringify(createParam)}`)
        if (this.nop) {
          return Promise.resolve([
            new NopCommand(this.constructor.name, this.repo, this.github.rest.teams.create.endpoint(createParam), 'Create Team')
          ])
        }
        return this.github.rest.teams.create(createParam).then(res => {
          this.log.debug(`team ${createParam.name} created`)
          existing = res.data
          this.log.debug(`adding team ${attrs.name} to repo ${this.repo.repo}`)
          return this.github.rest.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs))
        }).catch(e => {
          this.logError('Error adding team: ', e)
        })
      }
    })
  }

  remove (existing) {
    if (this.skipTeamDeletion) {
      this.log.debug(`Skipping deletion of team ${existing.slug} from repo ${this.repo.repo} because security manager team discovery failed`)
      return Promise.resolve()
    }

    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint(
          `DELETE ${teamRepoEndpoint}`,
          { team_slug: existing.slug, ...this.repo, org: this.repo.owner }
        ), 'DELETE Team')
      ])
    }
    return this.github.request(
      `DELETE ${teamRepoEndpoint}`,
      { team_slug: existing.slug, ...this.repo, org: this.repo.owner }
    )
  }

  toParams (existing, attrs) {
    return {
      team_id: existing.id,
      org: this.repo.owner,
      team_slug: existing.slug || this.normalizeTeamIdentifier(attrs.name),
      owner: this.repo.owner,
      repo: this.repo.repo,
      permission: attrs.permission
    }
  }
}
