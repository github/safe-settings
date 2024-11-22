const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = []

const version = {
  'X-GitHub-Api-Version': '2022-11-28'
}
module.exports = class Rulesets extends Diffable {
  constructor (nop, github, repo, entries, log, errors, scope) {
    super(nop, github, repo, entries, log, errors)
    this.github = github
    this.repo = repo
    this.rulesets = entries
    this.log = log
    this.nop = nop
    this.scope = scope || 'repo'
  }

  // Find all Rulesets for this org
  find () {
    if (this.scope === 'org') {
      this.log.debug(`Getting all rulesets for the org ${this.repo.owner}`)

      const listOptions = this.github.request.endpoint.merge('GET /orgs/{org}/rulesets', {
        org: this.repo.owner,
        headers: version
      })
      this.log.debug(listOptions)
      return this.github.paginate(listOptions)
        .then(res => {
          const rulesets = res.map(ruleset => {
            const getOptions = this.github.request.endpoint.merge('GET /orgs/{org}/rulesets/{id}', {
              org: this.repo.owner,
              id: ruleset.id,
              headers: version
            })
            return this.github.paginate(getOptions)
          })
          return Promise.all(rulesets).then(res => {
            return res ? res.flat(1) : []
          })
        }).catch(e => {
          return this.handleError(e, [])
        })
    } else {
      this.log.debug(`Getting all rulesets for the repo ${this.repo}`)

      const listOptions = this.github.request.endpoint.merge('GET /repos/{owner}/{repo}/rulesets', {
        owner: this.repo.owner,
        repo: this.repo.repo,
        headers: version
      })
      this.log(listOptions)
      return this.github.paginate(listOptions)
        .then(res => {
          const rulesets = res
            .filter(ruleset => ruleset.source_type === 'Repository')
            .map(ruleset => {
              const getOptions = this.github.request.endpoint.merge('GET /repos/{owner}/{repo}/rulesets/{id}', {
                owner: this.repo.owner,
                repo: this.repo.repo,
                id: ruleset.id,
                headers: version
              })
              return this.github.paginate(getOptions)
            })
          return Promise.all(rulesets).then(res => {
            return res ? res.flat(1) : []
          })
        }).catch(e => {
          return this.handleError(e, [])
        })
    }
  }

  isEmpty (maybeEmpty) {
    return (maybeEmpty === null) || Object.keys(maybeEmpty).length === 0
  }

  comparator (existing, attrs) {
    return existing.name === attrs.name
  }

  changed (existing, attrs) {
    const mergeDeep = new MergeDeep(this.log, this.github, ignorableFields)
    const merged = mergeDeep.compareDeep(existing, attrs)
    return merged.hasChanges
  }

  update (existing, attrs) {
    const parms = this.wrapAttrs(Object.assign({ id: existing.id }, attrs))
    if (this.scope === 'org') {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint('PUT /orgs/{org}/rulesets/{id}', parms), 'Update Ruleset')
        ])
      }
      this.log.debug(`Updating Ruleset with the following values ${JSON.stringify(parms, null, 2)}`)
      return this.github.request('PUT /orgs/{org}/rulesets/{id}', parms).then(res => {
        this.log(`Ruleset updated successfully ${JSON.stringify(res.url)}`)
        return res
      }).catch(e => {
        return this.handleError(e)
      })
    } else {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint('PUT /repos/{owner}/{repo}/rulesets/{id}', parms), 'Update Ruleset')
        ])
      }
      this.log.debug(`Updating Ruleset with the following values ${JSON.stringify(parms, null, 2)}`)
      return this.github.request('PUT /repos/{owner}/{repo}/rulesets/{id}', parms).then(res => {
        this.log(`Ruleset updated successfully ${JSON.stringify(res.url)}`)
        return res
      }).catch(e => {
        return this.handleError(e)
      })
    }
  }

  add (attrs) {
    if (this.scope === 'org') {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint('POST /orgs/{org}/rulesets', this.wrapAttrs(attrs)), 'Create Ruleset')
        ])
      }
      this.log.debug(`Creating Rulesets with the following values ${JSON.stringify(attrs, null, 2)}`)
      return this.github.request('POST /orgs/{org}/rulesets', this.wrapAttrs(attrs)).then(res => {
        this.log(`Ruleset created successfully ${JSON.stringify(res.url)}`)
        return res
      }).catch(e => {
        return this.handleError(e)
      })
    } else {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint('POST /repos/{owner}/{repo}/rulesets', this.wrapAttrs(attrs)), 'Create Ruleset')
        ])
      }
      this.log.debug(`Creating Rulesets with the following values ${JSON.stringify(attrs, null, 2)}`)
      return this.github.request('POST /repos/{owner}/{repo}/rulesets', this.wrapAttrs(attrs)).then(res => {
        this.log(`Ruleset created successfully ${JSON.stringify(res.url)}`)
        return res
      }).catch(e => {
        return this.handleError(e)
      })
    }
  }

  remove (existing) {
    const parms = this.wrapAttrs(Object.assign({ id: existing.id }))
    if (this.scope === 'org') {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint('DELETE /orgs/{org}/rulesets/{id}', parms), 'Delete Ruleset')
        ])
      }
      this.log.debug(`Deleting Ruleset with the following values ${JSON.stringify(parms, null, 2)}`)
      return this.github.request('DELETE /orgs/{org}/rulesets/{id}', parms).then(res => {
        this.log(`Ruleset deleted successfully ${JSON.stringify(res.url)}`)
        return res
      }).catch(e => {
        return this.handleError(e)
      })
    } else {
      if (this.nop) {
        return Promise.resolve([
          new NopCommand(this.constructor.name, this.repo, this.github.request.endpoint('DELETE /repos/{owner}/{repo}/rulesets/{id}', parms), 'Delete Ruleset')
        ])
      }
      this.log.debug(`Deleting Ruleset with the following values ${JSON.stringify(parms, null, 2)}`)
      return this.github.request('DELETE /repos/{owner}/{repo}/rulesets/{id}', parms).then(res => {
        this.log(`Ruleset deleted successfully ${JSON.stringify(res.url)}`)
        return res
      }).catch(e => {
        if (e.status === 404) {
          return
        }
        return this.handleError(e)
      })
    }
  }

  wrapAttrs (attrs) {
    if (this.scope === 'org') {
      return Object.assign({}, attrs, {
        org: this.repo.owner,
        headers: version
      })
    } else {
      return Object.assign({}, attrs, {
        owner: this.repo.owner,
        repo: this.repo.repo,
        headers: version
      })
    }
  }

  handleError (e, returnValue) {
    this.logError(e)
    if (this.nop) {
      return Promise.resolve([(new NopCommand(this.constructor.name, this.repo, null, `error: ${e}`, 'ERROR'))])
    }
    return Promise.resolve(returnValue)
  }
}
