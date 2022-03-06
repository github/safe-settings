// THIS IS A SPECIAL PLUGIN, DON'T ADD IT TO THE LIST OF PLUGINS IN SETTINGS
const NopCommand = require('../nopcommand')

const UnlockRepoMutation = `
mutation($repoId: ID!) {
  unarchiveRepository(input:{clientMutationId:"true",repositoryId: $repoId}) {
      repository {
          isArchived
      }
  }
}`
const GetRepoQuery = `query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo){
      id,
      isArchived,
  }
}`

function returnValue (shouldContinue, nop) {
  return { shouldContinue, nopCommands: nop }
}

/// Unarchives repos before the other plugins.
/// This is optimized for the case where safe-settings is the source of truth when it cames to the archive config bit.

/// If the archived config is not set then we don't even read the archived status for the repo (it saves one call)
/// This has the implication that if a repo is archived outside safe settings, other plugins may attempt to change the data and fail (it's their responsability to check if the repo is archived)
/// However if the archive config is set, we will return false to indicate other plugins shouldn't be executed if the repo is archived (and archive config is true)
module.exports = class Unarchiver {
  constructor (nop, github, repo, settings, log) {
    this.github = github
    this.repo = repo
    this.settings = settings
    this.log = log
    this.nop = nop
  }

  // Returns true if should proceed false otherwise
  async sync () {
    if (typeof (this.settings?.archived) !== 'undefined') {
      this.log.debug(`Checking if ${this.repo.owner}/${this.repo.repo} is archived`)
      const graphQLResponse = await this.github.graphql(GetRepoQuery, { owner: this.repo.owner, repo: this.repo.repo })
      this.log(`Repo ${this.repo.owner}/${this.repo.repo} is ${graphQLResponse.repository.isArchived ? 'archived' : 'not archived'}`)

      if (graphQLResponse.repository.isArchived) {
        if (this.settings.archived) {
          this.log(`Repo ${this.repo.owner}/${this.repo.repo} already archived, inform other plugins should not run.`)
          return returnValue(false)
        } else {
          this.log(`Unarchiving ${this.repo.owner}/${this.repo.repo} ${graphQLResponse.repository.id}`)
          if (this.nop) {
            return returnValue(true, [new NopCommand('Unarchiver', this.repo, null, 'will unarchive')])
          } else {
            const graphQLUnlockResponse = await this.github.graphql(UnlockRepoMutation, { repoId: graphQLResponse.repository.id })
            this.log.debug(`Unarchived result ${JSON.stringify(graphQLUnlockResponse)}`)

            return returnValue(true)
          }
        }
      }
      this.log(`Repo ${this.repo.owner}/${this.repo.repo} not archived, ignoring.`)
    } else {
      this.log(`Repo ${this.repo.owner}/${this.repo.repo} archived config not set, ignoring.`)
    }
    return returnValue(true)
  }
}
