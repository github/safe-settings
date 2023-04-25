module.exports = class Validator {
  constructor (github, repo, settings, log) {
    this.github = github
    this.pattern = settings.pattern
    // this.regex = /[a-zA-Z0-9_-]+_\w[a-zA-Z0-9_-]+.*/gm
    this.regex = new RegExp(this.pattern, 'gm')
    this.repo = repo
    this.log = log
  }

  sync () {
    try {
      return this.github.repos.getAllTopics({
        owner: this.repo.owner,
        repo: this.repo.repo,
        mediaType: {
          previews: ['mercy']
        }
      }).then(res => {
        if (this.repo.repo.search(this.regex) >= 0) {
          this.log(`Repo ${this.repo.repo} Passed Validation for pattern ${this.pattern}`)
          if (res.data.names.find(x => x === 'validation-error')) {
            res.data.names = res.data.names.filter(x => x !== 'validation-error')
          }
        } else {
          this.log(`Repo ${this.repo.repo} Failed Validation for pattern ${this.pattern}`)
          if (!res.data.names.find(x => x === 'validation-error')) {
            res.data.names.push('validation-error')
          }
        }
        return this.github.repos.replaceAllTopics({
          owner: this.repo.owner,
          repo: this.repo.repo,
          names: res.data.names,
          mediaType: {
            previews: ['mercy']
          }
        })
      })
    } catch (error) {
      this.log(`Error in Validation checking ${error}`)
    }
  }
}
