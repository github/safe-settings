module.exports = class Repository {
  constructor (github, repo, settings,installation_id,log) {
    this.installation_id=installation_id
    this.github = github
    this.settings = Object.assign({ mediaType: { previews: ['baptiste'] } }, settings, repo)
    this.topics = this.settings.topics
    this.repo = repo
    this.log=log
    delete this.settings.topics
  }

  sync () {
    this.log.debug('Syncing Repo ',this.settings.name)
    this.settings.name = this.settings.name || this.settings.repo
    return this.github.repos.get(this.repo).then(()=>{
        return this.updaterepo()
      }).catch(e=>{
        if (e.status === 404) {
          this.log.debug('Creating repo with settings ', this.settings)
          this.github.repos.createInOrg(this.settings)
          .then(newrepo=>{
            return this.updaterepo();
          })
        } 
      })
  }

  updaterepo() {
    this.log.debug('Updating repo with settings ', this.settings)
    this.github.repos.update(this.settings).then(() => {
      if (this.topics) {
        this.log.debug('Updating repo with topics ', this.topics)
        return this.github.repos.replaceTopics({
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
