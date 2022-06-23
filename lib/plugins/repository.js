//const { restEndpointMethods } = require('@octokit/plugin-rest-endpoint-methods')
//const EndPoints = require('@octokit/plugin-rest-endpoint-methods')
const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = [
  "id",
  "node_id",
  "full_name",
  "private",
  "fork",
  "created_at",
  "updated_at",
  "pushed_at",
  "size",
  "stargazers_count",
  "watchers_count",
  "language",
  "has_wiki",
  "has_pages",
  "forks_count",
  "archived",
  "disabled",
  "open_issues_count",
  "license",
  "allow_forking",
  "is_template",
 // "topics",
  "visibility",
  "forks",
  "open_issues",
  "watchers",
  "permissions",
  "temp_clone_token",
  "allow_merge_commit",
  "allow_rebase_merge",
  "allow_auto_merge",
  "delete_branch_on_merge",
  "organization",
  "security_and_analysis",
  "network_count",
  "subscribers_count",
  "mediaType",
  "owner",
  "org",
  "force_create",
  "auto_init",
  "repo"
]

module.exports = class Repository {
  constructor (nop, github, repo, settings, installationId, log) {
    this.installationId = installationId
    this.github = github
    this.settings = Object.assign( { mediaType: { previews: ['nebula-preview'] } }, settings, repo)
    this.topics = this.settings.topics
    this.security = this.settings.security
    this.repo = repo
    this.log = log
    this.nop = nop
    this.force_create = this.settings.force_create
    this.template = this.settings.template
    //delete this.settings.topics
    delete this.settings.force
    delete this.settings.template
  }
  
  sync () {
    const resArray = []
    this.log.debug(`Syncing Repo ${this.settings.name}`)
    this.settings.name = this.settings.name || this.settings.repo
    
    return this.github.repos.get(this.repo)
    .then( resp => {
      if (this.nop) {
        try {
          const mergeDeep = new MergeDeep(this.log,ignorableFields)
          const results = JSON.stringify(mergeDeep.compareDeep(resp.data, this.settings),null,2)
          this.log(`Result of compareDeep = ${results}`)
          resArray.push(new NopCommand("Repository", this.repo, null, `Followings changes will be applied to the repo settings = ${results}`))
        } catch(e){
          this.log.error(e)
        }
      }

      if (this.settings.default_branch && (resp.data.default_branch !== this.settings.default_branch)) {
        return this.renameBranch(resp.data.default_branch,this.settings.default_branch).then()
      } 
    })
    .then(res => {
      resArray.concat(res)
      // Remove topics as it would be handled seperately
      delete this.settings.topics
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

  updaterepo() {
    const parms = {
      owner: this.settings.owner,
      repo: this.settings.repo,
      //names: this.topics.split(/\s*,\s*/),
      names: this.topics,
      mediaType: {
        previews: ['mercy']
      },
      security: this.security
    }

    this.log.debug(`Updating repo with settings ${JSON.stringify(this.topics)} ${JSON.stringify(this.settings)}`)
    if (this.nop) {
      let result = [
        new NopCommand(this.constructor.name, this.repo, this.github.repos.update.endpoint(this.settings),"Update Repo"),
      ]
      if (this.topics) {
        result.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.replaceAllTopics.endpoint(parms),"Update Topics"))
      }
      return Promise.resolve(result)
    }

    return this.github.repos.update(this.settings).then((updatedRepo) => {
      this.updateSecurity(parms, updatedRepo)
      this.updatetopics(parms, updatedRepo)
    })
  }

  updatetopics(parms, repoData) {
    if (this.topics) {
      if (repoData.data?.topics.length !== this.topics.length ||
        !repoData.data?.topics.every(t => this.topics.includes(t))) {
        this.log(`Updating repo with topics ${this.topics.join(",")}`)
        return this.github.repos.replaceAllTopics(parms)
      } else {
        this.log(`no need to update topics for ${repoData.data.name}`)
      }
    }
  }

  //Added support for Code Security and Analysis
  updateSecurity(parms, repoData){
    if (this.security) {
      this.log(`Found repo with security settings ${JSON.stringify(this.security)}`)
      if (this.security?.enableVulnerabilityAlerts == true || this.security?.enableVulnerabilityAlerts == false) {    
          if(this.security.enableVulnerabilityAlerts == true){
            this.log(`Enabling Dependabot alerts for owner: ${repoData.data.owner.login} and repo ${repoData.data.name}`);
            this.github.repos.enableVulnerabilityAlerts({
              owner: repoData.data.owner.login,
              repo: repoData.data.name
            });
          }
          if(this.security.enableVulnerabilityAlerts == false){
            this.log(`Disabling Dependabot alerts for for owner: ${repoData.data.owner.login} and repo ${repoData.data.name}`);
            this.github.repos.disableVulnerabilityAlerts({
              owner: repoData.data.owner.login,
              repo: repoData.data.name
            });
          }
      } else {
        this.log(`no need to update security for ${repoData.data.name}`);
      }
    }
  }
}
