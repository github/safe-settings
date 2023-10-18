// Base class to make it easy to log errors as issue in the `admin` repo
module.exports = class ErrorStash {
  constructor (errors) {
    this.errors = errors
  }

  async logError (msg) {
    this.log.error(msg)
    this.errors.push({
      owner: this.repo.owner,
      repo: this.repo.repo,
      msg,
      plugin: this.constructor.name
    })
  }
}
