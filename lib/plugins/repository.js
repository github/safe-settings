module.exports = class Repository {
  constructor (github, repo, settings, installationId, log) {
    this.installationId = installationId
    this.github = github
    this.settings = Object.assign( { mediaType: { previews: ['nebula-preview'] } }, settings, repo)
    this.topics = this.settings.topics
    this.repo = repo
    this.log = log
    delete this.settings.topics
  }

  sync () {
    this.log.debug(`Syncing Repo ${this.settings.name}`)
    this.settings.name = this.settings.name || this.settings.repo
    return this.github.repos.get(this.repo).then(() => {
      return this.updaterepo().then(this.log(`Successfully updated the repo`)).catch(e => {this.log(`Error ${JSON.stringify(e)}`)})
    })
    .catch(e => {
      //this.log.error(` Error ${JSON.stringify(e)}`)
      if (e.status === 404) {
        this.log('Creating repo with settings ', this.settings)
        return this.github.repos.createInOrg(this.settings).then( () => {
          return this.updaterepo()
        })
      }
    })
  }

  updaterepo () {
    this.log(`Updating repo with settings ${JSON.stringify(this.settings)}`)
    return this.github.repos.update(this.settings).then(() => {
      if (this.topics) {
        this.log('Updating repo with topics ', this.topics)
        return this.github.repos.replaceAllTopics({
          owner: this.settings.owner,
          repo: this.settings.repo,
          names: this.topics.split(/\s*,\s*/),
          mediaType: {
            previews: ['mercy']
          }
        })
      }
    })
  }
}
