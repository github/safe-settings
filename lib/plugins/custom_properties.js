const Diffable = require('./diffable')

module.exports = class CustomProperties extends Diffable {
  constructor (...args) {
    super(...args)

    if (this.entries) {
      // Force all names to lowercase to avoid comparison issues.
      this.entries.forEach(prop => {
        prop.name = prop.name.toLowerCase()
      })
    }
  }

  async find () {
    const data = await this.github.request('GET /repos/:org/:repo/properties/values', {
      org: this.repo.owner,
      repo: this.repo.repo
    })

    const properties = data.data.map(d => { return { name: d.property_name, value: d.value } })
    return properties
  }

  comparator (existing, attrs) {
    return existing.name === attrs.name
  }

  changed (existing, attrs) {
    return attrs.value !== existing.value
  }

  async update (existing, attrs) {
    await this.github.request('PATCH /repos/:org/:repo/properties/values', {
      org: this.repo.owner,
      repo: this.repo.repo,
      properties: [{
        property_name: attrs.name,
        value: attrs.value
      }]
    })
  }

  async add (attrs) {
    await this.github.request('PATCH /repos/:org/:repo/properties/values', {
      org: this.repo.owner,
      repo: this.repo.repo,
      properties: [{
        property_name: attrs.name,
        value: attrs.value
      }]
    })
  }

  async remove (existing) {
    await this.github.request('PATCH /repos/:org/:repo/properties/values', {
      org: this.repo.owner,
      repo: this.repo.repo,
      properties: [
        {
          property_name: existing.name,
          value: null
        }
      ]
    })
  }
}
