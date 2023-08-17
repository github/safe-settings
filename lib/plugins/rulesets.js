const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = []

module.exports = class Rulesets extends Diffable {
  constructor (nop, github, repo, entries, log) {
    super(nop, github, repo, entries, log)
    this.github = github
    this.org = repo.owner
    this.rulesets = entries
    this.log = log
    this.nop = nop
  }

  // Find all Rulesets for this org
  find () {
    this.log.debug(`Getting all rulesets for the org ${this.org}`)

    const listOptions = this.github.request.endpoint.merge('GET /orgs/{org}/rulesets', {
      org: this.org,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    this.log(listOptions)
    return this.github.paginate(listOptions)
      .then(res => {
        const rulesets = res.map(ruleset => {
          const getOptions = this.github.request.endpoint.merge('GET /orgs/{org}/rulesets/{id}', {
            org: this.org,
            id: ruleset.id,
            headers: {
              'X-GitHub-Api-Version': '2022-11-28'
            }
          })
          return this.github.paginate(getOptions)
        })
        return Promise.all(rulesets).then(res => {
          return res ? res.flat(1) : []
        })
      }).catch(e => {
        this.log.error(e)
        return []
      })
  }

  isEmpty (maybeEmpty) {
    return (maybeEmpty === null) || Object.keys(maybeEmpty).length === 0
  }

  comparator (existing, attrs) {
    return existing.name === attrs.name
  }

  changed (existing, attrs) {
    const mergeDeep = new MergeDeep(this.log, ignorableFields)
    const merged = mergeDeep.compareDeep(existing, attrs)
    return merged.hasChanges
  }

  update (existing, attrs) {
    const parms = this.wrapAttrs(Object.assign({ id: existing.id }, attrs))
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
      this.log.error(` ${JSON.stringify(e)}`)
    })
  }

  add (attrs) {
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
      this.log.error(` ${JSON.stringify(e)}`)
    })
  }

  remove (existing) {
    const parms = this.wrapAttrs(Object.assign({ id: existing.id }))
    // if (this.nop) {
    //   return Promise.resolve([
    //     new NopCommand(this.constructor.name, this.repo, this.github.fetch.endpoint('DELETE /orgs/{org}/rulesets/{id}', parms), 'Delete Ruleset')
    //   ])
    // }
    this.log.debug(`Deleting Ruleset with the following values ${JSON.stringify(parms, null, 2)}`)
    return this.github.request('DELETE /orgs/{org}/rulesets/{id}', parms).then(res => {
      this.log(`Ruleset deleted successfully ${JSON.stringify(res.url)}`)
      return res
    }).catch(e => {
      this.log.error(` ${JSON.stringify(e)}`)
    })
  }

  wrapAttrs (attrs) {
    return Object.assign({}, attrs, {
      org: this.org,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
  }
}
