const ErrorStash = require('./errorStash')
const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = []
const previewHeaders = { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }

module.exports = class Branches extends ErrorStash {
  constructor (nop, github, repo, settings, log, errors) {
    super(errors)
    this.github = github
    this.repo = repo
    this.branches = settings
    this.log = log
    this.nop = nop
  }

  sync () {
    const resArray = []
    return this.github.repos.get(this.repo).then((currentRepo) => {
      return Promise.all(
        this.branches
          .filter(branch => branch.protection !== undefined)
          .map(branch => {
            // If branch protection is empty
            if (this.isEmpty(branch.protection)) {
              let p = Object.assign(this.repo, { branch: branch.name })
              if (branch.name === 'default') {
                p = Object.assign(this.repo, { branch: currentRepo.data.default_branch })
                this.log(`Deleting default branch protection for branch ${currentRepo.data.default_branch}`)
              }
              // Hack to handle closures and keep params from changing
              const params = Object.assign({}, p)
              if (this.nop) {
                resArray.push(
                  new NopCommand(this.constructor.name, this.repo, this.github.repos.deleteBranchProtection.endpoint(params), 'Delete Branch Protection')
                )
                return Promise.resolve(resArray)
              }

              return this.github.repos.deleteBranchProtection(params).catch(e => { return [] })
            } else {
              // Branch protection is not empty
              let p = Object.assign(this.repo, { branch: branch.name })
              if (branch.name === 'default') {
                p = Object.assign(this.repo, { branch: currentRepo.data.default_branch })
                // this.log(`Setting default branch protection for branch ${currentRepo.data.default_branch}`)
              }
              // Hack to handle closures and keep params from changing
              const params = Object.assign({}, p)
              return this.github.repos.getBranchProtection(params).then((result) => {
                const mergeDeep = new MergeDeep(this.log, this.github, ignorableFields)
                const changes = mergeDeep.compareDeep({ branch: { protection: this.reformatAndReturnBranchProtection(result.data) } }, { branch: { protection: branch.protection } })
                const results = { msg: `Followings changes will be applied to the branch protection for ${params.branch.name} branch`, additions: changes.additions, modifications: changes.modifications, deletions: changes.deletions }
                this.log.debug(`Result of compareDeep = ${results}`)

                if (!changes.hasChanges) {
                  this.log.debug(`There are no changes for branch ${JSON.stringify(params)}. Skipping branch protection changes`)
                  if (this.nop) {
                    return Promise.resolve(resArray)
                  }
                  return Promise.resolve()
                }

                this.log.debug(`There are changes for branch ${JSON.stringify(params)}\n ${JSON.stringify(changes)} \n Branch protection will be applied`)
                if (this.nop) {
                  resArray.push(new NopCommand(this.constructor.name, this.repo, null, results))
                }

                Object.assign(params, branch.protection, { headers: previewHeaders })

                if (this.nop) {
                  resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.updateBranchProtection.endpoint(params), 'Add Branch Protection'))
                  return Promise.resolve(resArray)
                }
                this.log.debug(`Adding branch protection ${JSON.stringify(params)}`)
                return this.github.repos.updateBranchProtection(params)
                  .then(res => {
                    this.log.info(`Branch protection applied successfully ${JSON.stringify(res.url)}`)
                    return res.url
                  })
                  .catch(e => {
                    this.logError(`Error applying branch protection ${JSON.stringify(e)}`)
                    return []
                  })
              }).catch((e) => {
                if (e.status === 404) {
                  Object.assign(params, branch.protection, { headers: previewHeaders })
                  if (this.nop) {
                    resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.updateBranchProtection.endpoint(params), 'Add Branch Protection'))
                    return Promise.resolve(resArray)
                  }
                  this.log.debug(`Adding branch protection ${JSON.stringify(params)}`)
                  return this.github.repos.updateBranchProtection(params).then(res => this.log(`Branch protection applied successfully ${JSON.stringify(res.url)}`)).catch(e => { this.logError(`Error applying branch protection ${JSON.stringify(e)}`); return [] })
                } else {
                  this.logError(e)
                  if (this.nop) {
                    resArray.push(new NopCommand(this.constructor.name, this.repo, this.github.repos.updateBranchProtection.endpoint(params), `${e}`, 'ERROR'))
                    return Promise.resolve(resArray)
                  }
                }
              })
            }
          })
      ).then(res => {
        return res.flat(2)
      }) /* End of Promise.all */
    }).catch(e => {
      // Repo is not found
      if (e.status === 404) {
        return Promise.resolve([])
      }
    })
  }

  isEmpty (maybeEmpty) {
    return (maybeEmpty === null) || Object.keys(maybeEmpty).length === 0
  }

  reformatAndReturnBranchProtection (protection) {
    if (protection) {
      // Re-format the enabled protection attributes
      protection.required_conversation_resolution = protection.required_conversation_resolution && protection.required_conversation_resolution.enabled
      protection.allow_deletions = protection.allow_deletions && protection.allow_deletions && protection.allow_deletions.enabled
      protection.required_linear_history = protection.required_linear_history && protection.required_linear_history.enabled
      protection.enforce_admins = protection.enforce_admins && protection.enforce_admins.enabled
      protection.required_signatures = protection.required_signatures && protection.required_signatures.enabled
      if (protection.required_pull_request_reviews && !protection.required_pull_request_reviews.bypass_pull_request_allowances) {
        protection.required_pull_request_reviews.bypass_pull_request_allowances = { apps: [], teams: [], users: [] }
      }
    }
    return protection
  }
}
