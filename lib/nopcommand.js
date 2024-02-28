class NopCommand {
  constructor (pluginName, repo, endpoint, action, type = 'INFO') {
    this.type = type
    this.plugin = pluginName
    this.repo = repo.repo
    this.endpoint = endpoint ? endpoint.url : ''
    this.body = endpoint ? endpoint.body : ''
    // check if action is a string
    if (typeof action === 'string') {
      this.action = { msg: action, additions: null, modifications: null, deletions: null }
    } else {
      this.action = action
    }
  }

  toString () {
    return `${this.plugin} plugin will perform ${this.action} using this API ${this.endpoint} passing ${JSON.stringify(this.body, null, 4)}`
  }
}
module.exports = NopCommand
