const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

const teamRepoEndpoint = '/orgs/:owner/teams/:team_slug/repos/:owner/:repo'
const listExternalGroupsEndpoint = 'GET /orgs/{org}/external-groups'
const teamExternalGroupsEndpoint = '/orgs/{org}/teams/{team_slug}/external-groups'

module.exports = class Teams extends Diffable {
  // Override Diffable.sync to also reconcile the optional `external_group`
  // link on each team entry after the normal team-repo permission sync.
  // This runs regardless of whether the team-repo association was added,
  // updated, or already in sync -- so updating only `external_group` on a
  // team that already has correct repo permissions still triggers the link.
  async sync () {
    const res = await super.sync()
    if (!this.entries) return res

    const filtered = this.filterEntries()
    const entriesWithExternalGroup = filtered.filter(e => e && e.external_group)
    if (entriesWithExternalGroup.length === 0) return res

    const nopCommands = Array.isArray(res) ? res : []
    for (const attrs of entriesWithExternalGroup) {
      await this.syncExternalGroup(attrs, this.nop ? nopCommands : undefined)
    }
    return this.nop ? nopCommands : res
  }

  async find () {
    this.log.debug(`Finding teams for ${this.repo.owner}/${this.repo.repo}`)
    return this.github.paginate(this.github.rest.repos.listTeams, this.repo).then(res => {
      this.log.debug(`Found teams ${JSON.stringify(res)}`)
      return this.checkSecurityManager(res)
    })
  }

  // remove all security manager teams
  async checkSecurityManager (teams) {
    try {
      // Uncomment the following lines to handle the deprecation of the teams api https://gh.io/security-managers-rest-api-sunset
      // but this would require a new permission on the app
      //
      // const roles = await this.github.paginate('GET /orgs/{org}/roles', { org: this.repo.owner })
      // const securityManagerRole = roles.find(role => role.name === 'security_manager')
      //
      // this.log.debug(`Calling API to get security managers ${JSON.stringify(this.github.request.endpoint('GET /orgs/{org}/roles/{role_id}/teams',
      //   {
      //     org: this.repo.owner,
      //     role_id: securityManagerRole.id
      //   }))} `)
      // const resp = await this.github.paginate('GET /orgs/{org}/roles/{role_id}/teams',
      //   {
      //     org: this.repo.owner,
      //     role_id: securityManagerRole.id
      //   })

      this.log.debug('Removing all security manager teams since they should not be handled here')
      this.log.debug(`Calling API to get security managers ${JSON.stringify(this.github.request.endpoint('GET /orgs/{org}/security-managers',
         {
            org: this.repo.owner
          }))} `)
      const resp = await this.github.paginate('GET /orgs/{org}/security-managers',
        { org: this.repo.owner })

      this.log.debug(`Response from the call is ${JSON.stringify(resp)}`)
      return teams.filter(team => !resp.some(sec => sec.name === team.name))
    } catch (e) {
      if (e.status === 404) {
        this.log.debug(`${this.repo.owner} Org does not have Security manager teams set up ${e}`)
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
    return this.github.rest.teams.getByName({ org: this.repo.owner, team_slug: attrs.name }).then(res => {
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

  // Resolve the org's external-group display name -> group_id. Lazily builds
  // a per-org Map (name -> id) the first time it's needed within a sync, and
  // caches it on the shared `github` client so multiple repos / teams in the
  // same sync only paginate `GET /orgs/{org}/external-groups` once per org.
  // Returns null when the named group does not exist for the org (logs an
  // error so the user can correct their yaml).
  async resolveExternalGroupId (groupName) {
    if (!this.github.__externalGroupsCache) {
      this.github.__externalGroupsCache = new Map()
    }
    const cache = this.github.__externalGroupsCache
    const org = this.repo.owner
    if (!cache.has(org)) {
      try {
        // The external-groups endpoint returns { total_count, groups: [...] }
        // and is not in Octokit's known-pagination list, so we must pass a
        // map function that extracts the `groups` array from each page;
        // otherwise paginate() yields the raw response objects and we'd
        // silently fail to find any names.
        const groups = await this.github.paginate(
          listExternalGroupsEndpoint,
          { org, per_page: 100 },
          (response) => (response && response.data && response.data.groups) || []
        )
        const byName = new Map()
        for (const g of groups) {
          // Keys are lower-cased so lookups are case-insensitive, matching
          // the comparison used by the SCIM-sync workflow's
          // wait-for-scim-sync.py (which lower-cases both sides). Without
          // this, a yaml `external_group` value that differs only in case
          // from the IdP-provisioned display name would be reported as
          // "not found" even though the group exists and the CI gate
          // considers it synced.
          if (g && g.group_name) byName.set(g.group_name.toLowerCase(), g.group_id)
        }
        this.log.debug(`Loaded ${byName.size} external group(s) for org ${org}: ${JSON.stringify(Array.from(byName.keys()))}`)
        cache.set(org, byName)
      } catch (e) {
        this.logError(`Error listing external groups for org ${org}: ${e}`)
        // Cache an empty map so we don't retry-storm the API within this sync.
        cache.set(org, new Map())
      }
    }
    const id = cache.get(org).get(groupName.toLowerCase())
    if (id === undefined) {
      return null
    }
    return id
  }

  // Link a team to an external IdP group identified by display name. Only
  // acts when the team entry carries an `external_group` property. Idempotent:
  // checks the current link first and skips the PATCH if already linked to
  // the same group_id. Sets `this.hasChanges = true` only when a PATCH
  // actually fires, so the suborg re-evaluation logic in lib/settings.js sees
  // a real change signal.
  async syncExternalGroup (attrs, nopCommands) {
    const groupName = attrs && attrs.external_group
    if (!groupName) return

    const groupId = await this.resolveExternalGroupId(groupName)
    if (groupId === null) {
      const msg = `External group '${groupName}' not found for org ${this.repo.owner} (team '${attrs.name}'). This is expected if the team/group is newly added and has not finished SCIM-provisioning yet.`
      // Non-fatal: a brand-new team's external group commonly doesn't exist
      // yet until the Azure AD -> GitHub SCIM cycle completes, so this is
      // logged as a warning (not logError) to avoid failing the whole sync.
      this.log.warn(msg)
      // For PR dry-run / nop mode, surface it as a WARNING (not ERROR) in the
      // check_run output, so it's visible but doesn't mark the run as failed.
      if (this.nop && Array.isArray(nopCommands)) {
        nopCommands.push(new NopCommand(this.constructor.name, this.repo, null, msg, 'WARNING'))
      }
      return
    }

    const linkParams = {
      org: this.repo.owner,
      team_slug: attrs.name,
      group_id: groupId
    }

    if (this.nop) {
      if (Array.isArray(nopCommands)) {
        nopCommands.push(new NopCommand(
          this.constructor.name,
          this.repo,
          this.github.request.endpoint(`PATCH ${teamExternalGroupsEndpoint}`, linkParams),
          `Link team ${attrs.name} to external group '${groupName}'`
        ))
      }
      return
    }

    // Idempotency: skip the PATCH if the team is already linked to this group.
    try {
      const current = await this.github.request(`GET ${teamExternalGroupsEndpoint}`, {
        org: this.repo.owner,
        team_slug: attrs.name
      })
      const currentGroups = (current && current.data && current.data.groups) || []
      if (currentGroups.some(g => g.group_id === groupId)) {
        this.log.debug(`Team ${attrs.name} is already linked to external group '${groupName}' (id=${groupId}); skipping.`)
        return
      }
    } catch (e) {
      // 404 here means no current link; fall through to PATCH. Any other
      // error is non-fatal -- the PATCH itself is idempotent on the server.
      if (e.status !== 404) {
        this.logError(`Error fetching current external group for team ${attrs.name}: ${e}`)
      }
    }

    try {
      await this.github.request(`PATCH ${teamExternalGroupsEndpoint}`, linkParams)
      this.log.debug(`Linked team ${attrs.name} to external group '${groupName}' (id=${groupId}).`)
      // Surface this change so suborg re-evaluation (in lib/settings.js) and
      // other consumers see that the team plugin made a real change.
      this.hasChanges = true
    } catch (e) {
      this.logError(`Error linking team ${attrs.name} to external group '${groupName}' (id=${groupId}): ${e}`)
    }
  }
}
