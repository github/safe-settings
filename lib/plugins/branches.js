const previewHeaders = { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }

module.exports = class Branches {
  constructor (github, repo, settings, log) {
    this.github = github
    this.repo = repo
    this.branches = settings
    this.log = log
  }

  sync () {
    this.log(`Syncing branches ${JSON.stringify(this.branches)}`)
    return Promise.all(
      this.branches
        .filter(branch => branch.protection !== undefined)
        .map(async(branch) => {
          let params = Object.assign(this.repo, { branch: branch.name })
          if (this.isEmpty(branch.protection)) {
            return this.github.repos.removeBranchProtection(params)
          } else {
            if (branch.name === 'default') {
              this.log('calling get repo')
              let result = await this.github.repos.get(this.repo)
              this.log(`after calling ${result}`)
              params = Object.assign(this.repo, { branch: result.data.default_branch }) 
              this.log(`Setting default branch protection for branch ${result.data.default_branch}`)              
            } 
            Object.assign(params, branch.protection, { headers: previewHeaders })
            this.log(`Adding branch protection ${JSON.stringify(params)}`)
            return this.github.repos.updateBranchProtection(params)       
          }
        })
    )
  }

  isEmpty (maybeEmpty) {
    return (maybeEmpty === null) || Object.keys(maybeEmpty).length === 0
  }
}
