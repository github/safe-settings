const mergeBy = require('./mergeArrayBy')
const NAME_FIELDS = ['name', 'username']
class MergeDeep {
  constructor (log, ignorableFields, configvalidators = {}, overridevalidators = {}) {
    this.log = log
    this.ignorableFields = ignorableFields
    this.configvalidators = configvalidators
    this.overridevalidators = overridevalidators
  }

  isObject (item) {
    return (item && typeof item === 'object' && !Array.isArray(item))
  }

  isEmpty (item) {
    if (this.isObject(item)) {
      return Object.keys(item).length === 0
    } else if (Array.isArray(item)) {
      for (const a of item) {
        if (!this.isEmpty(a)) {
          return false
        }
      }
      return true
    } else {
      return item === undefined
    }
  }

  compareEmptyTarget (t, s, additions, modifications) {
    const hasChanges = !(s === undefined || this.isEmpty(s))
    additions = Object.assign(additions, s)
    return ({ additions, modifications, hasChanges })
  }

  /**
   * Compare deeply a base object with overlay object
   *
   * @param {*} t base object
   * @param {*} s overlay object
   * @param {*} additions aggregated so far
   * @param {*} modifications aggregated so far
   * @returns object with additions, modifications
   */
  compareDeep (t, s, additions, modifications) {
    if (additions === undefined) {
      if (Array.isArray(s)) {
        additions = []
        modifications = []
      } else {
        additions = {}
        modifications = {}
      }
    }
    if (t === undefined || this.isEmpty(t)) {
      return this.compareEmptyTarget(t, s, additions, modifications)
    }

    // Don't iterate characters (string primitives are compared in the loop)
    if (typeof s === 'string') {
      return
    }

    // Convert top-level array to object
    const target = Array.isArray(t) ? Object.assign({}, { __array: t }) : t
    const source = Array.isArray(s) ? Object.assign({}, { __array: s }) : s

    for (const key in source) {
      // Logic specific for Github
      // API response includes urls for resources, or other ignorable fields; we can ignore them
      if (key.indexOf('url') >= 0 || this.ignorableFields.indexOf(key) >= 0) {
        continue
      }

      // If the attribute of the object or the element of the array is not a simple primitive
      if (this.isObject(source[key]) || Array.isArray(source[key])) {
        if (Array.isArray(source[key])) {
          additions[key] = []
          modifications[key] = []
        } else {
          additions[key] = {}
          modifications[key] = {}
        }

        // Deep compare Array if the same element is there in source and target,
        if (Array.isArray(source[key]) && Array.isArray(target[key])) {
          if (source[key].length !== target[key].length) {
            modifications[key] = [...source[key]]
          }
          const visited = {}
          const temp = [...source[key], ...target[key]]
          for (const a of temp) {
            if (this.isObject(a)) {
              if (visited[a.name]) {
                // Common array in target and source
                modifications[key].push({})
                additions[key].push({})
                this.compareDeep(a, visited[a.name], additions[key][additions[key].length - 1], modifications[key][modifications[key].length - 1])
                // Any addtions for the matching key must be moved to modifications
                if (!this.isEmpty(additions[key])) {
                  modifications[key] = modifications[key].concat(additions[key])
                }
                // Add name attribute to the modifications to make it look better ; it won't be added otherwise as it would be the same
                if (!this.isEmpty(modifications[key][modifications[key].length - 1])) {
                  Object.assign(modifications[key][modifications[key].length - 1], { name: a.name })
                }
                delete visited[a.name]
                continue
              } else if (visited[a.username]) {
                // Common array in target and source
                modifications[key].push({})
                additions[key].push({})
                this.compareDeep(a, visited[a.username], additions[key][additions[key].length - 1], modifications[key][modifications[key].length - 1])
                if (!this.isEmpty(additions[key])) {
                  modifications[key] = modifications[key].concat(additions[key])
                }
                // Add username attribute to the modifications to make it look better ; it won't be added otherwise as it would be the same
                if (!this.isEmpty(modifications[key][modifications[key].length - 1])) {
                  Object.assign(modifications[key][modifications[key].length - 1], { username: a.username })
                }
                delete visited[a.username]
                continue
              }
              if (a.name) {
                visited[a.name] = a
              } else if (a.username) {
                visited[a.username] = a
              } else if (a.login) {
                visited[a.login] = a
              }
            } else {
              // If already seen this, it is not a missing field
              if (visited[a]) {
                delete visited[a]
                continue
              }
              visited[a] = a
            }
          }
          const combined = []
          for (const fields of Object.keys(visited)) {
            combined.push(visited[fields])
          }
          if (['apps', 'teams', 'users'].includes(key)) {
            const sourceAdditions = combined.filter(value => !target[key].includes(value))
            const targetAdditions = combined.filter(value => {
              for (const entity of source[key]) {
                if (entity.name === value.login) {
                  return false
                }
                if (entity.username === value.login) {
                  return false
                }
                if (entity.login === value.login) {
                  return false
                }
              }
              return true
            }
            )
            additions[key] = sourceAdditions.length > targetAdditions.length ? sourceAdditions : targetAdditions
          } else {
            // Elements that are in target are not additions
            additions[key] = combined.filter(value => !target[key].includes(value))
          }
        } else {
          // recursively compare the objects
          this.compareDeep(target[key], source[key], additions[key], modifications[key])
        }
      } else {
        if (target[key] === undefined) {
          if (source[key]) {
            additions[key] = source[key]
          }
        } else if (target[key] !== source[key]) {
          modifications[key] = source[key]
          // retroactively add `name` or `username` to the modifications
          if (source.name) {
            this.log.debug(`Adding name for ${key} ${source[key]}`)
            modifications.name = source.name
          } else if (source.username) {
            modifications.username = source.username
          } else if (source.login) {
            modifications.login = source.login
          }
        }
      }
      modifications = this.removeEmptyAndNulls(modifications, key)
      additions = this.removeEmptyAndNulls(additions, key)
    }
    let hasChanges = !this.isEmpty(additions) || !this.isEmpty(modifications)
    // Indicate changes when source is empty and target is not
    hasChanges |= this.isEmpty(source) && !this.isEmpty(target)
    return ({ additions, modifications, hasChanges })
  }

  validateOverride (key, baseconfig, overrideconfig) {
    if (this.overridevalidators[key]) {
      // this.log.debug(`Calling overridevalidator for key ${key} `)
      if (!this.overridevalidators[key].canOverride(baseconfig, overrideconfig)) {
        this.log.error(`Error in calling overridevalidator for key ${key} ${this.overridevalidators[key].error}`)
        throw new Error(this.overridevalidators[key].error)
      }
    }
  }

  validateConfig (key, baseconfig) {
    if (this.configvalidators[key]) {
      // this.log.debug(`Calling configvalidator for key ${key} `)
      if (!this.configvalidators[key].isValid(baseconfig)) {
        this.log.error(`Error in calling configvalidator for key ${key} ${this.configvalidators[key].error}`)
        throw new Error(this.configvalidators[key].error)
      }
    }
  }

  mergeEmptyTarget (target, source) {
    if (Array.isArray(source)) {
      target = Array.isArray(target) ? target.concat(source) : source
    } else {
      target = Object.assign({}, source)
    }
    return target
  }

  mergeDeep (immutabletarget, ...sources) {
    let target = Object.assign({}, immutabletarget)
    while (sources.length) {
      const source = sources.shift()

      if (target === undefined || this.isEmpty(target)) {
        target = this.mergeEmptyTarget(target, source)
        continue
      }

      for (const key in source) {
        // If the attribute of the object or the element of the array is not a simple primitive
        if (this.isObject(source[key]) || Array.isArray(source[key])) {
          // Deep merge Array so that if the same element is there in source and target,
          // override the target with source otherwise include both source and target elements
          if (Array.isArray(source[key]) && Array.isArray(target[key])) {
            const combined = mergeBy(key, this.configvalidators[key], this.overridevalidators[key], NAME_FIELDS, target[key], source[key])
            Object.assign(target, {
              [key]: combined
            })
          } else {
            this.validateOverride(key, target[key], source[key])
            target[key] = this.mergeDeep(target[key], source[key])
            this.validateConfig(key, target[key])
          }
        } else {
          // Not calling validators when target[key] is primitive or empty
          target[key] = source[key]
        }
      }
    }
    return target
  }

  removeEmptyAndNulls (modifications, key) {
    if (Array.isArray(modifications[key])) {
      modifications[key] = modifications[key].filter(k => {
        return !this.isEmpty(k)
      })
    }

    if (this.isEmpty(modifications[key])) {
      delete modifications[key]
    } else {
      if (Array.isArray(modifications)) {
        modifications.push(modifications[key])
        delete modifications[key]
      }
    }

    if (Array.isArray(modifications)) {
      modifications = modifications.filter(k => {
        return !this.isEmpty(k)
      })
    }
    return modifications
  }
}
MergeDeep.NAME_FIELDS = NAME_FIELDS
module.exports = MergeDeep
