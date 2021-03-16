const Diffable = require('./diffable')

// it is necessary to use this endpoint until GitHub Enterprise supports
// the modern version under /orgs
const teamRepoEndpoint = '/teams/:team_id/repos/:owner/:repo'
// const teamEndpoint = '/teams/:team_id'
const snooze = ms => new Promise(resolve => setTimeout(resolve, ms))
module.exports = class Teams extends Diffable {
  async find () {
    this.log('Finding teams')
    await snooze(2 * 1000)
    return this.github.repos.listTeams(this.repo).then(res => res.data)
  }

  comparator (existing, attrs) {
    return existing.slug === attrs.name
  }

  changed (existing, attrs) {
    return existing.permission !== attrs.permission
  }

  update (existing, attrs) {
    return this.github.request(`PUT ${teamRepoEndpoint}`, this.toParams(existing, attrs))
  }

  add (attrs) {
    let existing = { team_id: 1 }
    return this.github.teams.getByName({ org: this.repo.owner, team_slug: attrs.name }).then(res => {
      existing = res.data
      this.log(`adding team ${attrs.name} to repo ${this.repo.repo}`)
      return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs)).then(res => {
        this.log(`team added ${res.data}`)
      })
    }).catch(e => {
      if (e.status === 404) {
        this.log(`Creating teams {org: ${this.repo.owner}, name: ${attrs.name}`)
        return this.github.teams.create({ org: this.repo.owner, name: attrs.name }).then(res => {
          this.log('team created')
          existing = res.data
          this.log(`adding team ${attrs.name} to repo ${this.repo.repo}`)
          return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs))
        }).catch(e => {
          this.log(`Error adding team ${e}`)
        })
      }
    })
  }

  remove (existing) {
    return this.github.request(
      `DELETE ${teamRepoEndpoint}`,
      { team_id: existing.id, ...this.repo, org: this.repo.owner }
    )
  }

  toParams (existing, attrs) {
    return {
      team_id: existing.id,
      team_slug: attrs.name,
      owner: this.repo.owner,
      repo: this.repo.repo,
      permission: attrs.permission
    }
  }
}
