const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = []
const previewHeaders = { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }

module.exports = class Branches {
  constructor (nop, github, repo, settings, log) {
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
          .map(async (branch) => {
            let hasChanges = false
            let params = Object.assign(this.repo, { branch: branch.name })
            if (this.isEmpty(branch.protection)) {
              if (branch.name === 'default') {
                params = Object.assign(this.repo, { branch: currentRepo.data.default_branch })
                this.log(`Deleting default branch protection for branch ${currentRepo.data.default_branch}`)
              }
              if (this.nop) {
                resArray.concat([
                  new NopCommand(this.constructor.name, this.repo, this.github.repos.deleteBranchProtection.endpoint(params), 'Delete Branch Protection')
                ])
                return Promise.resolve(resArray)
              }
              return this.github.repos.deleteBranchProtection(params).catch(e => { return [] })
            } else {
              if (branch.name === 'default') {
                params = Object.assign(this.repo, { branch: currentRepo.data.default_branch })
                this.log(`Setting default branch protection for branch ${currentRepo.data.default_branch}`)
              }

              let result
              try {
                result = await this.github.repos.getBranchProtection(params)
              } catch (e) {
                this.log.error(e)
              }

              if (result) {
                const mergeDeep = new MergeDeep(this.log, ignorableFields)
                this.log.debug(`New Protection ${JSON.stringify(branch.name)} ${JSON.stringify(branch.protection)}`)
                this.log.debug(`Existing protection ${JSON.stringify(params)} ${JSON.stringify(this.reformatAndReturnBranchProtection(result.data))}`)
                const changes = mergeDeep.compareDeep(this.reformatAndReturnBranchProtection(result.data), branch.protection)
                this.log.debug(`Changes for ${JSON.stringify(changes)}`)
                hasChanges = changes.additions.length > 0 || changes.modifications.length > 0
                if (this.nop) {
                  const results = JSON.stringify(changes, null, 2)
                  this.log(`Result of compareDeep = ${results}`)
                  resArray.push(new NopCommand('Branch Protection', this.repo, null, `${branch.name} branch settings has ${changes.additions.length} additions and ${changes.modifications.length} modifications`))
                }
              } else {
                // No existing branch protection
                if (this.nop) {
                  resArray.push(new NopCommand('Branch Protection', this.repo, null, `${branch.name} branch settings has 1 additions and 0 modifications`))
                }
                console.log(`222 No branch protection ${branch.name} ${result}`)
                hasChanges = true
              }

              if (!hasChanges) {
                this.log.debug(`There are no changes for Branch Protection ${JSON.stringify(this.repo)} ${branch.name}. Skipping branch protection changes`)
                return
              }

              params = Object.assign(this.repo, { branch: branch.name }, branch.protection, { headers: previewHeaders })
              this.log(`Adding branch protection ${JSON.stringify(params)}`)
              if (this.nop) {
                resArray.push(
                  new NopCommand(this.constructor.name, this.repo, this.github.repos.updateBranchProtection.endpoint(params), 'Add Branch Protection')
                )
                return Promise.resolve(resArray)
              }
              return this.github.repos.updateBranchProtection(params).then(res => this.log(`Branch protection applied successfully ${JSON.stringify(res.url)}`)).catch(e => { this.log(`Error applying branch protection ${JSON.stringify(e)}`); return [] })
            }
          })
      )
    })
      .catch(e => {
      // this.log.error(` Error ${JSON.stringify(e)}`)
        if (e.status === 404) {
          return Promise.resolve([])
        }
      })
  }

  isEmpty (maybeEmpty) {
    return (maybeEmpty === null) || Object.keys(maybeEmpty).length === 0
  }

  reformatAndReturnBranchProtection (protection) {
    // Re-format the enabled protection attributes
    if (protection.required_conversation_resolution.enabled) {
      protection.required_conversation_resolution = protection.required_conversation_resolution?.enabled
    }
    if (protection.allow_deletions.enabled) {
      protection.allow_deletions = protection.allow_deletions?.enabled
    }
    if (protection.required_linear_history.enabled) {
      protection.required_linear_history = protection.required_linear_history?.enabled
    }
    if (protection.enforce_admins.enabled) {
      protection.enforce_admins = protection.enforce_admins?.enabled
    }
    if (protection.required_signatures.enabled) {
      protection.required_signatures = protection.required_signatures?.enabled
    }
    return protection
  }
}
