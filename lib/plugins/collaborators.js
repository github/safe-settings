/* eslint-disable camelcase */
const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

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
    // this.log.debug(`Finding collaborators for { repo: ${this.repo.repo}, owner: ${this.repo.owner}, affiliation: 'direct', 'outside', and 'pending invites' }`)
    return Promise.all([this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'direct' }),
      this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'outside' }),
      this.github.repos.listInvitations({ repo: this.repo.repo, owner: this.repo.owner })])
      .then(res => {
        const mapCollaborator = user => {
          return {
            // Force all usernames to lowercase to avoid comparison issues.
            username: user.login.toLowerCase(),
            pendinginvite: false,
            permission: (user.permissions.admin && 'admin') ||
            (user.permissions.push && 'push') ||
            (user.permissions.pull && 'pull')
          }
        }

        const results0 = (res[0].data || []).map(mapCollaborator)
        const results1 = (res[1].data || []).map(mapCollaborator)
        const results2 = (res[2].data || []).map(invite => {
          return {
          // Force all usernames to lowercase to avoid comparison issues.
            username: invite.invitee.login.toLowerCase(),
            pendinginvite: true,
            invitation_id: invite.id,
            permission: (invite.permissions === 'admin' && 'admin') ||
            (invite.permissions === 'read' && 'pull') ||
            (invite.permissions === 'write' && 'push')
          }
        })
        return results0.concat(results1).concat(results2)
      })
      .catch(e => {
        this.logError(e)
        return []
      })
  }

  comparator (existing, attrs) {
    return existing.username === attrs.username
  }

  changed (existing, attrs) {
    return existing.permission !== attrs.permission
  }

  update (existing, attrs) {
    if (existing.pendinginvite) {
      return this.updateInvite(existing.invitation_id, attrs.permission)
    } else {
      return this.add(attrs)
    }
  }

  add (attrs) {
    const data = Object.assign({}, attrs, this.repo)
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.repos.addCollaborator.endpoint(data), 'Add Collaborators')
      ])
    }
    return this.github.repos.addCollaborator(data)
  }

  updateInvite (invitation_id, permissions) {
    const data = Object.assign({
      invitation_id,
      permissions: (permissions === 'admin' && 'admin') ||
      (permissions === 'pull' && 'read') ||
      (permissions === 'push' && 'write')
    }, this.repo)
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.repos.updateInvitation.endpoint(data), 'Update Invitation')
      ])
    }
    return this.github.repos.updateInvitation(data)
  }

  remove (existing) {
    if (existing.pendinginvite) {
      const data = Object.assign({ invitation_id: existing.invitation_id }, this.repo)
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.repos.deleteInvitation.endpoint(data),
            'Delete Invitation')
        ])
      }
      return this.github.repos.deleteInvitation(data)
    } else {
      const data = Object.assign({ username: existing.username }, this.repo)
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.repos.removeCollaborator.endpoint(data),
            'Remove Collaborator')
        ])
      }
      return this.github.repos.removeCollaborator(data)
    }
  }
}
