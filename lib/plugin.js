// Base class for all plugins

module.exports = class Plugin {
  constructor (log, repoName) {
    this.log = log.child({ plugin: this.constructor.name, repository: repoName })
  }
}
