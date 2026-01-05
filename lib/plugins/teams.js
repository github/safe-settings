const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

const teamRepoEndpoint = '/orgs/:owner/teams/:team_slug/repos/:owner/:repo'
module.exports = class Teams extends Diffable {
  async find () {
    this.log.debug(`Finding teams for ${this.repo.owner}/${this.repo.repo}`)
    return this.github.paginate(this.github.repos.listTeams, this.repo).then(res => {
      this.log.debug(`Found teams ${JSON.stringify(res)}`)
      return this.checkSecurityManager(res)
    })
  }

  // remove all security manager teams
  async checkSecurityManager (teams) {
    try {
      // Try the new API first (organization roles)
      // This requires Organization administration: read permission
      try {
        this.log.debug('Attempting to fetch security manager teams via roles API')
        const roles = await this.github.paginate('GET /orgs/{org}/roles', { org: this.repo.owner })
        const securityManagerRole = roles.find(role => role.name === 'security_manager')
        
        if (securityManagerRole) {
          this.log.debug(`Found security_manager role with id ${securityManagerRole.id}`)
          const resp = await this.github.paginate('GET /orgs/{org}/roles/{role_id}/teams',
            {
              org: this.repo.owner,
              role_id: securityManagerRole.id
            })
          this.log.debug(`Response from roles API: ${JSON.stringify(resp)}`)
          return teams.filter(team => !resp.some(sec => sec.name === team.name))
        } else {
          this.log.debug('No security_manager role found')
          return teams
        }
      } catch (rolesError) {
        // If roles API fails (403/404/410), fall back gracefully
        if (rolesError.status === 403) {
          this.log.debug('App lacks Organization administration permission, skipping security manager check')
          return teams
        } else if (rolesError.status === 410 || rolesError.status === 404) {
          this.log.debug('Security managers feature not available, skipping check')
          return teams
        }
        throw rolesError // Re-throw unexpected errors
      }
    } catch (e) {
      if (e.status === 404) {
        this.log.debug(`${this.repo.owner} Org does not have Security manager teams set up ${e}`)
      } else if (e.status === 403) {
        this.log.debug(`Insufficient permissions to check security managers for ${this.repo.owner}`)
      } else {
        this.log.error(
        `Unexpected error when fetching for security manager teams org ${this.repo.owner} = ${e}`
        )
      }
      return teams
    }
  }

  comparator (existing, attrs) {
    return existing.slug === attrs.name.toLowerCase()
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
    return this.github.teams.getByName({ org: this.repo.owner, team_slug: attrs.name }).then(res => {
      existing = res.data
      this.log.debug(`adding team ${attrs.name} to repo ${this.repo.repo}`)
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.teams.addOrUpdateRepoPermissionsInOrg.endpoint(this.toParams(existing, attrs)), 'Add Teams to Repo')
        ])
      }
      return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs)).then(res => {
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
            new NopCommand(this.constructor.name, this.repo, this.github.teams.create.endpoint(createParam), 'Create Team')
          ])
        }
        return this.github.teams.create(createParam).then(res => {
          this.log.debug(`team ${createParam.name} created`)
          existing = res.data
          this.log.debug(`adding team ${attrs.name} to repo ${this.repo.repo}`)
          return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs))
        }).catch(e => {
          if (e.status === 403) {
            this.logError(`Error creating team "${attrs.name}": Insufficient permissions. Either create the team manually or grant the app "Members: Read-only" permission.`, e)
          } else {
            this.logError(`Error creating team "${attrs.name}": `, e)
          }
        })
      }
    })
  }

  remove (existing) {
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
      team_slug: attrs.name,
      owner: this.repo.owner,
      repo: this.repo.repo,
      permission: attrs.permission
    }
  }
}
