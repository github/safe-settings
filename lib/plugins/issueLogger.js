// Base class to make it easy to log errors as issue in the `admin` repo
const env = require('../env')
module.exports = class IssueLogger {
  async logError (msg) {
    this.log.error(msg)
    if (env.CREATE_ERROR_ISSUE === 'true') {
      return this.github.issues.create({
        owner: this.repo.owner,
        repo: env.ADMIN_REPO,
        body: msg,
        title: `Safe-settings error in ${this.constructor.name} plugin for repo ${this.repo.repo}`
      })
    }
  }
}
