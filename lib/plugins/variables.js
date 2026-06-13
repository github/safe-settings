const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

module.exports = class Variables extends Diffable {
  constructor (...args) {
    super(...args)

    if (this.entries) {
      this.entries.forEach((variable) => {
        variable.name = variable.name.toUpperCase()
      })
    }
  }

  find () {
    this.log.debug(`Finding repo vars for ${this.repo.owner}/${this.repo.repo}`)
    return this.github.request('GET /repos/:org/:repo/actions/variables', {
      org: this.repo.owner,
      repo: this.repo.repo
    }).then(({ data: { variables } }) => variables.map(({ name, value }) => ({ name, value })))
  }

  comparator (existing, attrs) {
    return existing.name === attrs.name
  }

  changed (existing, attrs) {
    return existing.value !== attrs.value
  }

  update (existing, attrs) {
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, null, `Update variable ${attrs.name}`)
      ])
    }
    return this.github.request('PATCH /repos/:org/:repo/actions/variables/:variable_name', {
      org: this.repo.owner,
      repo: this.repo.repo,
      variable_name: attrs.name.toUpperCase(),
      value: attrs.value.toString()
    })
  }

  add (attrs) {
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, null, `Add variable ${attrs.name}`)
      ])
    }
    return this.github.request('POST /repos/:org/:repo/actions/variables', {
      org: this.repo.owner,
      repo: this.repo.repo,
      name: attrs.name.toUpperCase(),
      value: attrs.value.toString()
    })
  }

  remove (existing) {
    if (this.nop) {
      return Promise.resolve([
        new NopCommand(this.constructor.name, this.repo, null, `Remove variable ${existing.name}`)
      ])
    }
    return this.github.request('DELETE /repos/:org/:repo/actions/variables/:variable_name', {
      org: this.repo.owner,
      repo: this.repo.repo,
      variable_name: existing.name.toUpperCase()
    })
  }
}
