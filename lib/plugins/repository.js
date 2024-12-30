// const { restEndpointMethods } = require('@octokit/plugin-rest-endpoint-methods')
// const EndPoints = require('@octokit/plugin-rest-endpoint-methods')
const ErrorStash = require('./errorStash')
const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = [
  'id',
  'node_id',
  'full_name',
  'private',
  'fork',
  'created_at',
  'updated_at',
  'pushed_at',
  'size',
  'stargazers_count',
  'watchers_count',
  'language',
  'forks_count',
  'disabled',
  'open_issues_count',
  'license',
  'allow_forking',
  'is_template',
  'forks',
  'open_issues',
  'watchers',
  'temp_clone_token',
  'organization',
  'security',
  'security_and_analysis',
  'network_count',
  'subscribers_count',
  'mediaType',
  'owner',
  'org',
  'force_create',
  'auto_init',
  'repo'
]

module.exports = class Repository extends ErrorStash {
  constructor (nop, github, repo, settings, installationId, log, errors) {
    super(errors)
    this.installationId = installationId
    this.github = github
    this.settings = Object.assign({ mediaType: { previews: ['nebula-preview'] } }, settings, repo)
    this.topics = this.settings.topics
    this.security = this.settings.security
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
    const resArray = []
    this.log.debug(`Syncing Repo ${this.settings.name}`)
    this.settings.name = this.settings.name || this.settings.repo
    // let hasChanges = false
    // let hasTopicChanges = false
    return this.github.repos.get(this.repo)
      .then(resp => {
        const mergeDeep = new MergeDeep(this.log, this.github, ignorableFields)

        const changes = mergeDeep.compareDeep(resp.data, this.settings)
        // hasChanges = changes.additions.length > 0 || changes.modifications.length > 0

        const topicChanges = mergeDeep.compareDeep({ entries: resp.data.topics }, { entries: this.topics })
        // hasTopicChanges = topicChanges.additions.length > 0 || topicChanges.modifications.length > 0

        // const results = JSON.stringify(changes, null, 2)
        const results = { msg: `${this.constructor.name} settings changes`, additions: changes.additions, modifications: changes.modifications, deletions: changes.deletions }

        this.log.debug(`Result of comparing repo for changes = ${results}`)

        // const topicResults = JSON.stringify(topicChanges, null, 2)
        const topicResults = { msg: `${this.constructor.name} settings changes for topics`, additions: topicChanges.additions, modifications: topicChanges.modifications, deletions: topicChanges.deletions }
        this.log.debug(`Result of comparing topics for changes source ${JSON.stringify(resp.data.topics)} target ${JSON.stringify(this.topics)} = ${topicResults}`)

        if (this.nop && changes.hasChanges) {
          resArray.push(new NopCommand('Repository', this.repo, null, results))
        }
        if (this.nop && topicChanges.hasChanges) {
          resArray.push(new NopCommand('Repository', this.repo, null, topicResults))
        }
        const promises = []
        if (topicChanges.hasChanges) {
          promises.push(this.updatetopics(resp.data, resArray))
        }
        if (changes.hasChanges) {
          this.log.debug('There are repo changes')
          let updateDefaultBranchPromise = Promise.resolve()
          if (this.settings.default_branch && (resp.data.default_branch !== this.settings.default_branch)) {
            this.log.debug('There is a rename of the default branch')
            updateDefaultBranchPromise = this.updateDefaultBranch(resp.data.default_branch, this.settings.default_branch, resArray)
          }
          // Remove topics as it would be handled seperately
          delete this.settings.topics
          const updateRepoPromise = updateDefaultBranchPromise.then(() => this.updaterepo(resArray))
          promises.push(updateRepoPromise.then(() => {
            return this.updateSecurity(resp.data, resArray)
          }))
          promises.push(updateRepoPromise.then(() => {
            return this.updateAutomatedSecurityFixes(resp.data, resArray)
          }))
        } else {
          promises.push(this.updateSecurity(resp.data, resArray))
        }
        if (this.nop) {
          return Promise.resolve(resArray)
        } else {
          return Promise.all(promises)
        }
      }).catch(e => {
        if (e.status === 404) {
          if (this.force_create) {
            if (this.template) {
              this.log.debug(`Creating repo using template ${this.template}`)
              const options = { template_owner: this.repo.owner, template_repo: this.template, owner: this.repo.owner, name: this.repo.repo, private: (this.settings.private ? this.settings.private : true), description: this.settings.description ? this.settings.description : '' }

              if (this.nop) {
                this.log.debug(`Creating Repo using template ${JSON.stringify(this.github.repos.createInOrg.endpoint(this.settings))}  `)
                resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.createUsingTemplate.endpoint(options), 'Create Repo Using Template'))
                return Promise.resolve(resArray)
              }
              return this.github.repos.createUsingTemplate(options)
            } else {
              // https://docs.github.com/en/rest/repos/repos#create-an-organization-repository uses org instead of owner like
              // the API to create a repo with a template
              this.settings.org = this.settings.owner
              this.log.debug('Creating repo with settings ', this.settings)
              if (this.nop) {
                this.log.debug(`Creating Repo ${JSON.stringify(this.github.repos.createInOrg.endpoint(this.settings))}  `)
                return Promise.resolve([
                  new NopCommand(this.constructor.name, this.repo, this.github.repos.createInOrg.endpoint(this.settings), 'Create Repo')
                ])
              }
              return this.github.repos.createInOrg(this.settings)
            }
          } else {
            if (this.nop) {
              return Promise.resolve([
                new NopCommand(this.constructor.name, this.repo, null, 'Force_create is false. Skipping repo creation')
              ])
            }
          }
        } else {
          this.logError(` Error ${JSON.stringify(e)}`)
        }
      })
  }

  updateDefaultBranch (oldname, newname, resArray) {
    this.log.debug(`Checking if ${newname} is already a branch`)
    return this.github.repos.getBranch({
      owner: this.settings.owner,
      repo: this.settings.repo,
      branch: newname
    }).then((res) => {
      this.log.debug(`Branch ${newname} already exists. Making it the default branch`)
      // If the old branch was renamed github will find the branch with the oldname the branch but the ref doesn't exist
      // So we'd have to rename it back to the oldname
      if (res.data.name !== newname) {
        return this.renameBranch(oldname, newname, resArray)
      } else {
        const parms = {
          owner: this.settings.owner,
          repo: this.settings.repo,
          default_branch: newname
        }
        if (this.nop) {
          resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.update.endpoint(parms), 'Update Repo'))
        } else {
          this.log.debug(`Updating repo with settings ${JSON.stringify(parms)}`)
          return this.github.repos.update(parms)
        }
      }
    }).catch(e => {
      if (e.status === 404) {
        return this.renameBranch(oldname, newname, resArray)
      } else {
        this.logError(`Error ${JSON.stringify(e)}`)
      }
    })
  }

  renameBranch (oldname, newname, resArray) {
    this.log.error(`Branch ${newname} does not exist. So renaming the current default branch ${oldname} to ${newname}`)
    const parms = {
      owner: this.settings.owner,
      repo: this.settings.repo,
      branch: oldname,
      new_name: newname
    }
    this.log.info(`Rename default branch repo with settings ${JSON.stringify(parms)}`)
    if (this.nop) {
      resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.renameBranch.endpoint(oldname, this.settings.default_branch), `Repo rename default branch to ${this.settings.default_branch}`))
    } else {
      return this.github.repos.renameBranch(parms)
    }
  }

  updaterepo (resArray) {
    this.log.debug(`Updating repo with settings ${JSON.stringify(this.topics)} ${JSON.stringify(this.settings)}`)
    if (this.nop) {
      resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.update.endpoint(this.settings), 'Update Repo'))
      return Promise.resolve(resArray)
    }
    return this.github.repos.update(this.settings)
  }

  updatetopics (repoData, resArray) {
    const parms = {
      owner: this.settings.owner,
      repo: this.settings.repo,
      names: this.topics,
      mediaType: {
        previews: ['mercy']
      }
    }

    if (this.topics) {
      // if (repoData.data?.topics.length !== this.topics.length ||
      //   !repoData.data?.topics.every(t => this.topics.includes(t))) {
      this.log.debug(`Updating repo with topics ${this.topics.join(',')}`)
      if (this.nop) {
        resArray.push((new NopCommand(this.constructor.name, this.repo, this.github.repos.replaceAllTopics.endpoint(parms), 'Update Topics')))
        return Promise.resolve(resArray)
      }
      return this.github.repos.replaceAllTopics(parms)
      // } else {
      //   this.log.debug(`no need to update topics for ${repoData.data.name}`)
      //   if (this.nop) {
      //     //resArray.push((new NopCommand(this.constructor.name, this.repo, null, `no need to update topics for ${repoData.data.name}`)))
      //     return Promise.resolve([])
      //   }
      // }
    }
  }

  // Added support for Code Security and Analysis
  updateSecurity (repoData, resArray) {
    if (this.security?.enableVulnerabilityAlerts === true || this.security?.enableVulnerabilityAlerts === false) {
      this.log.debug(`Found repo with security settings ${JSON.stringify(this.security)}`)
      if (this.security.enableVulnerabilityAlerts === true) {
        this.log.debug(`Enabling Dependabot alerts for owner: ${repoData.owner.login} and repo ${repoData.name}`)
        if (this.nop) {
          resArray.push((new NopCommand(this.constructor.name, this.repo, this.github.repos.enableVulnerabilityAlerts.endpoint({
            owner: repoData.owner.login,
            repo: repoData.name
          }), 'Enabling Dependabot alerts')))
          return Promise.resolve(resArray)
        }
        return this.github.repos.enableVulnerabilityAlerts({
          owner: repoData.owner.login,
          repo: repoData.name
        })
      } else {
        this.log.debug(`Disabling Dependabot alerts for for owner: ${repoData.owner.login} and repo ${repoData.name}`)
        if (this.nop) {
          resArray.push((new NopCommand(this.constructor.name, this.github.repos.disableVulnerabilityAlerts.endpoint({
            owner: repoData.owner.login,
            repo: repoData.name
          }), 'Disabling Dependabot alerts')))
          return Promise.resolve(resArray)
        }
        return this.github.repos.disableVulnerabilityAlerts({
          owner: repoData.owner.login,
          repo: repoData.name
        })
      }
    } else {
      this.log.debug(`no need to update security for ${repoData.name}`)
      if (this.nop) {
        // resArray.push((new NopCommand(this.constructor.name, this.repo, null, `no need to update security for ${repoData.name}`)))
        return Promise.resolve([])
      }
    }
  }

  updateAutomatedSecurityFixes (repoData, resArray) {
    if (this.security?.enableAutomatedSecurityFixes === true || this.security?.enableAutomatedSecurityFixes === false) {
      if (this.security.enableAutomatedSecurityFixes === true) {
        this.log.debug(`Enabling Dependabot security updates for owner: ${repoData.owner.login} and repo ${repoData.name}`)
        if (this.nop) {
          resArray.push((new NopCommand(this.constructor.name, this.repo, this.github.repos.enableAutomatedSecurityFixes.endpoint({
            owner: repoData.owner.login,
            repo: repoData.name
          }), 'Enabling Dependabot security updates')))
          return Promise.resolve(resArray)
        }
        return this.github.repos.enableAutomatedSecurityFixes({
          owner: repoData.owner.login,
          repo: repoData.name
        })
      } else {
        this.log.debug(`Disabling Dependabot security updates for owner: ${repoData.owner.login} and repo ${repoData.name}`)
        if (this.nop) {
          resArray.push((new NopCommand(this.constructor.name, this.github.repos.disableAutomatedSecurityFixes.endpoint({
            owner: repoData.owner.login,
            repo: repoData.name
          }), 'Disabling Dependabot security updates')))
          return Promise.resolve(resArray)
        }
        return this.github.repos.disableAutomatedSecurityFixes({
          owner: repoData.owner.login,
          repo: repoData.name
        })
      }
    }
  }
}
