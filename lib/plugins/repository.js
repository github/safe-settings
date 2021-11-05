//const { restEndpointMethods } = require('@octokit/plugin-rest-endpoint-methods')
//const EndPoints = require('@octokit/plugin-rest-endpoint-methods')
const NopCommand = require('../nopcommand')

module.exports = class Repository {
  constructor (nop, github, repo, settings, installationId, log) {
    this.installationId = installationId
    this.github = github
    this.settings = Object.assign( { mediaType: { previews: ['nebula-preview'] } }, settings, repo)
    this.topics = this.settings.topics
    this.repo = repo
    this.log = log
    this.nop = nop
    this.force_create = this.settings.force_create
    this.template = this.settings.template
    delete this.settings.topics
    delete this.settings.force
    delete this.settings.template
  }

  sync () {
    this.log.debug(`Syncing Repo ${this.settings.name}`)
    this.settings.name = this.settings.name || this.settings.repo
    
    return this.github.repos.get(this.repo)
    .then( resp => {
      if (this.settings.default_branch && (resp.data.default_branch !== this.settings.default_branch)) {
        return this.renameBranch(resp.data.default_branch,this.settings.default_branch)
      } 
    })
    .then(res => {
      const resArray = [res]
      // TODO May have to chain the nop results
      return this.updaterepo().then( res => {
        this.log(`Successfully updated the repo`)
        return resArray.concat(res)
      }).catch(e => {this.log(`Error ${JSON.stringify(e)}`)})
    })
    .catch(e => {
      if (e.status === 404) {
        if (this.force_create) {
          if (this.template) {
            this.log(`Creating repo using template ${this.template}`)
            const options = {template_owner: this.repo.owner, template_repo: this.template, owner: this.repo.owner, name: this.repo.repo, private: (this.settings.private?this.settings.private:true), description: this.settings.description?this.settings.description:"" }

            if (this.nop) {
              this.log.debug(`Creating Repo using template ${JSON.stringify(this.github.repos.createInOrg.endpoint(this.settings))}  `)
              return Promise.resolve([
                new NopCommand(this.constructor.name, this.repo, this.github.repos.createUsingTemplate.endpoint(options),"Create Repo Using Template"),
              ])
            }
            return this.github.repos.createUsingTemplate(options).then( () => {
              return this.updaterepo()
            })
          } else {
            this.log('Creating repo with settings ', this.settings)
            if (this.nop) {
              this.log.debug(`Creating Repo ${JSON.stringify(this.github.repos.createInOrg.endpoint(this.settings))}  `)
              return Promise.resolve([
                new NopCommand(this.constructor.name, this.repo, this.github.repos.createInOrg.endpoint(this.settings),"Create Repo"),
              ])
            }
            return this.github.repos.createInOrg(this.settings).then( () => {
              return this.updaterepo()
            })
          }

        } else {
          if (this.nop) {
            return Promise.resolve([
              new NopCommand(this.constructor.name, this.repo, null,"Force_create is false. Skipping repo creation"),
            ])
          }

        }
      } else {
        this.log.error(` Error ${JSON.stringify(e)}`)
      }
    })
  }

  renameBranch (oldname, newname) {
    const parms = {
      owner: this.settings.owner,
      repo: this.settings.repo,
      branch: oldname,
      new_name: newname
    }
    this.log.debug(`Rename default branch repo with settings ${JSON.stringify(parms)}`)
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.repos.renameBranch.endpoint(parms),"Rename Branch"),
      ])
    }
    return this.github.repos.renameBranch(parms)
  }

  updaterepo () {
    this.log.debug(`Updating repo with settings ${JSON.stringify(this.settings)}`)
    if (this.nop) {

      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, this.github.repos.update.endpoint(this.settings),"Update Repo"),
      ])
    }
    return this.github.repos.update(this.settings).then(() => {
      if (this.topics) {
        this.log('Updating repo with topics ', this.topics)
        return this.github.repos.replaceAllTopics({
          owner: this.settings.owner,
          repo: this.settings.repo,
          names: this.topics.split(/\s*,\s*/),
          mediaType: {
            previews: ['mercy']
          }
        })
      }
    })
  }
}
