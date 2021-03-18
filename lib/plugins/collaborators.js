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
    this.log.debug(`Finding collaborators for { repo: ${this.repo.repo}, owner: ${this.repo.owner}, affiliation: 'direct', 'outside', and 'pending invites' }`)
    return Promise.all([this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'direct' }),
    this.github.repos.listCollaborators({ repo: this.repo.repo, owner: this.repo.owner, affiliation: 'outside' }),
    this.github.repos.listInvitations({ repo: this.repo.repo, owner: this.repo.owner })])
    .then(res => {
      this.log.debug('Finding direct collaborators Succeeded ', res[0].data)
      this.log.debug('Finding outside collaborators Succeeded ', res[1].data)
      this.log.debug('Finding Invitations Succeeded ', res[2].data)
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
      this.log.debug(`direct collaborators ${JSON.stringify(results0)}`)      
      this.log.debug(`outside collaborators ${JSON.stringify(results1)}`)      
      this.log.debug(`pending invites ${JSON.stringify(results2)}`)
      return results0.concat(results1).concat(results2)
    })
    .catch(e => {
      console.log(e)
      return []
    })

      // this.github.repos.listInvitations({ repo: this.repo.repo, owner: this.repo.owner })
      // .then(res => {
      //   this.log.debug('Finding Invitations Succeeded ', res.data)
      //   return res.data.map(user => {
      //     return {
      //       // Force all usernames to lowercase to avoid comparison issues.
      //       username: user.invitee.login.toLowerCase(),
      //       permission: (user.permissions.admin && 'admin') ||
      //         (user.permissions.push && 'push') ||
      //         (user.permissions.pull && 'pull')
      //     }
      //   })
      // })
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
    return this.github.repos.addCollaborator(data)
  }

  updateInvite (invitation_id, permissions) {
    const data = Object.assign({ invitation_id: invitation_id, 
    permissions: (permissions === 'admin' && 'admin') ||
    (permissions === 'pull' && 'read') ||
    (permissions === 'push' && 'write') }, this.repo)
    // console.log('Adding collaborator ', data)
    return this.github.repos.updateInvitation(data)
  }

  remove (existing) {
    if (existing.pendinginvite) {
      return this.github.repos.deleteInvitation(
        Object.assign(this.repo, { invitation_id: existing.invitation_id })
      )
    } else {
      return this.github.repos.removeCollaborator(
        Object.assign(this.repo, { username: existing.username })
      )
    }
  }
}
