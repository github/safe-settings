const Diffable = require('./diffable')

module.exports = class Collaborators extends Diffable {
  constructor (...args) {
    super(...args)

    if (this.entries) {
      // Force all usernames to lowercase to avoid comparison issues.
      this.entries.forEach(collaborator => {
        collaborator.username = collaborator.username.toLowerCase()
      })
    }
  }

  find () {
    this.log.debug(`Finding collaborators for { repo: ${this.repo.repo}, owner: ${this.repo.owner}, affiliation: 'direct' }`)
    return this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'direct' })
      .then(res => {
        this.log.debug('Finding collaborators Succeeded ', res.data)
        return res.data.map(user => {
          return {
            // Force all usernames to lowercase to avoid comparison issues.
            username: user.login.toLowerCase(),
            permission: (user.permissions.admin && 'admin') ||
              (user.permissions.push && 'push') ||
              (user.permissions.pull && 'pull')
          }
        })
      })
  }

  comparator (existing, attrs) {
    return existing.username === attrs.username
  }

  changed (existing, attrs) {
    return existing.permission !== attrs.permission
  }

  update (existing, attrs) {
    return this.add(attrs)
  }

  add (attrs) {
    const data = Object.assign({}, attrs, this.repo)
    // console.log('Adding collaborator ', data)
    return this.github.repos.addCollaborator(data)
  }

  remove (existing) {
    return this.github.repos.removeCollaborator(
      Object.assign({ username: existing.username }, this.repo)
    )
  }
}
