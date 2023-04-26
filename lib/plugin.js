// Base class for all plugins

module.exports = class Plugin {
  constructor (log, repoName) {
    this.log = log.child({ component: 'plugin', plugin: this.constructor.name, repository: repoName })
  }
}
