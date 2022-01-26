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
    //this.log.debug(`Finding collaborators for { repo: ${this.repo.repo}, owner: ${this.repo.owner}, affiliation: 'direct', 'outside', and 'pending invites' }`)
    return Promise.all([this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'direct' }),
    this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'outside' }),
    this.github.repos.listInvitations({ repo: this.repo.repo, owner: this.repo.owner })])
    .then(res => {
      let results0 =  res[0].data.map(user => {
        return {
          // Force all usernames to lowercase to avoid comparison issues.
          username: user.login.toLowerCase(),
          pendinginvite: false,
          permission: (user.permissions.admin && 'admin') ||
            (user.permissions.push && 'push') ||
            (user.permissions.pull && 'pull')
        }
      })
      let results1 =  res[1].data.map(user => {
        return {
          // Force all usernames to lowercase to avoid comparison issues.
          username: user.login.toLowerCase(),
          pendinginvite: false,
          permission: (user.permissions.admin && 'admin') ||
            (user.permissions.push && 'push') ||
            (user.permissions.pull && 'pull')
        }
      })
      let results2 = res[2].data.map(invite => {
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
      console.log(e)
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
    // console.log('Adding collaborator ', data)
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.repos.addCollaborator.endpoint(data), "Add Collaborators"),
      ])
    }
    return this.github.repos.addCollaborator(data)
  }

  updateInvite (invitation_id, permissions) {
    const data = Object.assign({ invitation_id: invitation_id, 
    permissions: (permissions === 'admin' && 'admin') ||
    (permissions === 'pull' && 'read') ||
    (permissions === 'push' && 'write') }, this.repo)
    // console.log('Adding collaborator ', data)
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.repos.updateInvitation.endpoint(data), "Update Invitation"),
      ])
    }
    return this.github.repos.updateInvitation(data)
  }

  remove (existing) {
    if (existing.pendinginvite) {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.repos.deleteInvitation.endpoint(
            Object.assign(this.repo, { invitation_id: existing.invitation_id })), "Delete Invitation"),
        ])
      }
      return this.github.repos.deleteInvitation(
        Object.assign(this.repo, { invitation_id: existing.invitation_id })
      )
    } else {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.repos.removeCollaborator(
            Object.assign(this.repo, { username: existing.username })
          ), "Remove Collaborator"),
        ])
      }
      return this.github.repos.removeCollaborator(
        Object.assign(this.repo, { username: existing.username })
      )
    }
  }
}
