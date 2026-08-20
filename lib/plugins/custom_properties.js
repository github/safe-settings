const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

// Config shapes, precedence and the fail-closed behavior below are documented in
// README.md, "Preserving custom properties that `safe-settings` does not manage",
// with a commented example in docs/sample-settings/settings.yml.
function isExcludeAwareConfig (entries) {
  return !!entries &&
    typeof entries === 'object' &&
    !Array.isArray(entries) &&
    (Array.isArray(entries.include) || Array.isArray(entries.exclude))
}

module.exports = class CustomProperties extends Diffable {
  constructor (nop, github, repo, entries, log, errors) {
    let include = entries
    let exclude = []
    let malformed = false

    if (isExcludeAwareConfig(entries)) {
      include = Array.isArray(entries.include) ? entries.include : []
      exclude = Array.isArray(entries.exclude) ? entries.exclude : []
    } else if (entries !== null && entries !== undefined && !Array.isArray(entries)) {
      // Neither config shape, e.g. `custom_properties: {}`. Fail closed rather than
      // letting a TypeError escape the constructor and reject the org-wide sync.
      include = []
      malformed = true
    }

    super(nop, github, repo, include, log, errors)

    const { patterns, excludeAll } = this.compileExcludePatterns(exclude)
    this.exclude = patterns
    this.excludeAll = excludeAll || malformed

    if (malformed) {
      this.logError('`custom_properties` must be a list of properties or an object with `include` and/or `exclude` keys. Ignoring it and excluding all custom properties for this repo so no values are cleared.')
    }

    if (this.entries) {
      this.normalizeEntries()
    }
  }

  // An invalid pattern is recorded as a config error rather than thrown, because
  // child plugins are constructed outside any try/catch in `Settings.updateRepos`.
  compileExcludePatterns (exclude) {
    return exclude.reduce((state, item) => {
      if (!item || typeof item.name !== 'string') {
        return state
      }

      try {
        // Lowercased to match the normalized property names.
        state.patterns.push(new RegExp(item.name.toLowerCase()))
      } catch (e) {
        this.logError(`Invalid custom property exclude pattern "${item.name}": ${e.message || e}. Excluding all custom properties for this repo so no values are cleared.`)
        state.excludeAll = true
      }

      return state
    }, { patterns: [], excludeAll: false })
  }

  isExcluded (name) {
    if (this.excludeAll) {
      return true
    }

    return typeof name === 'string' && this.exclude.some(rx => rx.test(name))
  }

  // Force all names to lowercase to avoid comparison issues.
  normalizeEntries () {
    this.entries = this.entries.reduce((normalizedEntries, entry) => {
      if (!entry || typeof entry !== 'object') {
        return normalizedEntries
      }

      const entryName = entry.name || entry.property_name

      if (typeof entryName !== 'string') {
        return normalizedEntries
      }

      normalizedEntries.push({
        name: entryName.toLowerCase(),
        value: entry.value
      })

      return normalizedEntries
    }, [])
  }

  async find () {
    const { owner, repo } = this.repo
    const repoFullName = `${owner}/${repo}`

    this.log.debug(`Getting all custom properties for the repo ${repoFullName}`)

    const customProperties = await this.github.paginate(
      this.github.rest.repos.getCustomPropertiesValues,
      {
        owner,
        repo,
        per_page: 100
      }
    )
    this.log.debug(`Found ${customProperties.length} custom properties`)
    return this.normalize(customProperties)
  }

  // Force all names to lowercase to avoid comparison issues.
  normalize (properties) {
    return properties.reduce((normalizedProperties, property) => {
      if (!property || typeof property !== 'object') {
        return normalizedProperties
      }

      const propertyName = property.property_name || property.name

      if (typeof propertyName !== 'string') {
        return normalizedProperties
      }

      normalizedProperties.push({
        name: propertyName.toLowerCase(),
        value: property.value
      })

      return normalizedProperties
    }, [])
  }

  comparator (existing, attrs) {
    return existing.name === attrs.name
  }

  changed (existing, attrs) {
    return attrs.value !== existing.value
  }

  async update ({ name }, { value }) {
    return this.modifyProperty('Update', { name, value })
  }

  async add ({ name, value }) {
    return this.modifyProperty('Create', { name, value })
  }

  // Custom Properties on repository does not support deletion, so we set the value to null
  async remove ({ name }) {
    if (this.isExcluded(name)) {
      this.log.debug(`Custom Property "${name}" matches an exclude pattern; leaving its value untouched`)
      return Promise.resolve([])
    }
    return this.modifyProperty('Delete', { name, value: null })
  }

  async modifyProperty (operation, { name, value }) {
    const { owner, repo } = this.repo
    const repoFullName = `${owner}/${repo}`

    const params = {
      owner,
      repo,
      properties: [{
        property_name: name,
        value
      }]
    }

    if (this.nop) {
      return new NopCommand(
        this.constructor.name,
        this.repo,
        this.github.rest.repos.createOrUpdateCustomPropertiesValues.endpoint(params),
        `${operation} Custom Property`
      )
    }

    try {
      this.log.debug(`${operation} Custom Property "${name}" for the repo ${repoFullName}`)
      await this.github.rest.repos.createOrUpdateCustomPropertiesValues(params)
      this.log.debug(`Successfully ${operation.toLowerCase()}d Custom Property "${name}" for the repo ${repoFullName}`)
    } catch (e) {
      this.logError(`Error during ${operation} Custom Property "${name}" for the repo ${repoFullName}: ${e.message || e}`)
    }
  }
}
