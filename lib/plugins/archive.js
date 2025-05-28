const NopCommand = require('../nopcommand');

function returnValue(shouldContinue, nop) {
  return { shouldContinue, nopCommands: nop };
}

module.exports = class Archive {
  constructor(nop, github, repo, settings, log) {
    this.github = github;
    this.repo = repo;
    this.settings = settings;
    this.log = log;
    this.nop = nop;
  }

  // Returns true if plugin application should continue, false otherwise
  async sync() {
    // Fetch repository details using REST API
    const { data: repoDetails } = await this.github.repos.get({
        owner: this.repo.owner,
        repo: this.repo.repo
    });
    if (typeof this.settings?.archived !== 'undefined') {
      this.log.debug(`Checking if ${this.repo.owner}/${this.repo.repo} is archived`);
      
      this.log.debug(`Repo ${this.repo.owner}/${this.repo.repo} is ${repoDetails.archived ? 'archived' : 'not archived'}`);

      if (repoDetails.archived) {
        if (this.settings.archived) {
          this.log.debug(`Repo ${this.repo.owner}/${this.repo.repo} already archived, inform other plugins should not run.`);
          return returnValue(false);
        } 
        else {
          this.log.debug(`Unarchiving ${this.repo.owner}/${this.repo.repo}`);
          if (this.nop) {
            return returnValue(true, [new NopCommand(this.constructor.name, this.repo, this.github.repos.update.endpoint(this.settings), 'will unarchive')]);
          } 
          else {
            // Unarchive the repository using REST API
            const updateResponse = await this.github.repos.update({
              owner: this.repo.owner,
              repo: this.repo.repo,
              archived: false
            });
            this.log.debug(`Unarchive result ${JSON.stringify(updateResponse)}`);

            return returnValue(true);
          }
        }
      }
      else {
        if (this.settings.archived) {
          this.log.debug(`Archiving ${this.repo.owner}/${this.repo.repo}`);
          if (this.nop) {
            return returnValue(false, [new NopCommand(this.constructor.name, this.repo, this.github.repos.update.endpoint(this.settings), 'will archive')]);
          } 
          else {
            // Archive the repository using REST API
            const updateResponse = await this.github.repos.update({
              owner: this.repo.owner,
              repo: this.repo.repo,
              archived: true
            });
            this.log.debug(`Archive result ${JSON.stringify(updateResponse)}`);

            return returnValue(false);
          }
        }
        else {
          this.log.debug(`Repo ${this.repo.owner}/${this.repo.repo} is not archived, ignoring.`);
          return returnValue(true);
        }
      }
    } 
    else {
        if (repoDetails.archived) {
          this.log.debug(`Repo ${this.repo.owner}/${this.repo.repo} is archived, ignoring.`);
          return returnValue(false);
        }
        else {
            this.log.debug(`Repo ${this.repo.owner}/${this.repo.repo} is not archived, proceed as usual.`);
            return returnValue(true);
        }
    }
  }
};
