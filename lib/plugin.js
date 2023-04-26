module.exports = class Plugin {
  constructor (log, repo_name) {
    this.log = log.child({ component: 'plugin', plugin: this.constructor.name, repository: repo_name })
  }
}
