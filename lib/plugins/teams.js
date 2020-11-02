const Diffable = require('./diffable')

// it is necessary to use this endpoint until GitHub Enterprise supports
// the modern version under /orgs
const teamRepoEndpoint = '/teams/:team_id/repos/:owner/:repo'
const teamEndpoint = '/teams/:team_id'
const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));
module.exports = class Teams extends Diffable {
  find () {
    this.log("Finding teams")
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

  async add (attrs) {
    // Hack to prevent teams being added before the repo creation is done.
    snooze(5*1000)
    
    let existing = {team_id: 1}
    this.github.teams.getByName({ org: this.repo.owner, team_slug: attrs.name }).then(res => {
    //this.github.teams.getLegacy({team_id: 1}).then(res => {
        existing = res.data
      //return this.github.request(`PUT ${teamRepoEndpoint}`, this.toParams(existing, attrs))
      //return
      //return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs));
    }).catch(e=>{
      //this.log.debug("No teams found")
      //this.log.error(e)
      if (e.status === 404) {
        this.log.debug(`Creating teams {org: ${this.repo.owner}, name: ${attrs.name}`)
        this.github.teams.create({org: this.repo.owner, name: attrs.name}).then(res=>{existing=res.data})
        this.log.debug("team created")
      }
    })
    //const { data: existing } = await this.github.request(
    //  'GET /orgs/:org/teams/:team_slug',
    //  { org: this.repo.owner, team_slug: attrs.name }
    //)
    this.log.debug(`adding team ${attrs.name} to repo ${this.repo.repo}`)
    return this.github.teams.addOrUpdateRepoInOrg(this.toParams(existing, attrs));
    //return this.github.teams.addOrUpdateRepoPermissionsInOrg(this.toParams(existing, attrs));
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
      org: this.repo.owner,
      permission: attrs.permission
    }
  }
}
