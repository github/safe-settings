const mergeBy = require('./mergeArrayBy')
const DeploymentConfig = require('./deploymentConfig')

const NAME_FIELDS = ['name', 'username', 'actor_id', 'login', 'type', 'key_prefix', 'title']
const NAME_USERNAME_PROPERTY = item => NAME_FIELDS.find(prop => Object.prototype.hasOwnProperty.call(item, prop))
const GET_NAME_USERNAME_PROPERTY = item => { if (NAME_USERNAME_PROPERTY(item)) return item[NAME_USERNAME_PROPERTY(item)] }

class MergeDeep {
  constructor (log, github, ignorableFields = [], configvalidators = {}, overridevalidators = {}) {
    this.log = log
    this.github = github
    this.ignorableFields = ignorableFields
    this.configvalidators = DeploymentConfig.configvalidators
    this.overridevalidators = DeploymentConfig.overridevalidators
  }

  isObjectNotArray (item) {
    return (item && typeof item === 'object' && !Array.isArray(item))
  }

  isObject (item) {
    return (item && typeof item === 'object')
  }

  isEmpty (item) {
    if (this.isObjectNotArray(item)) {
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

  /**
   * Compare deeply a base object with overlay object.
   * This is a recursive function.
   * The base object is usually a setting in GH
   * The overlay objects the settings that are to be applied.
   *
   * One of the oddities is when we compare objects, we are only interested in the properties of source
   * So any property in the target that is not in the source is not treated as a deletion.
   *
   * @param {*} t base object
   * @param {*} s overlay object
   * @param {*} additions aggregated so far
   * @param {*} modifications aggregated so far
   * @param {*} deletions aggregated so far
   * @returns object with additions, modifications, and deletions
   */
  compareDeep (t, s, additions, modifications, deletions) {
    // Preemtively return if the source is not an object or array
    if (!this.isObject(s)) {
      return { additions, modifications, deletions, hasChanges: s !== t }
    }

    // Additions will be always passed in subsequent invocations
    const firstInvocation = (additions === undefined)

    // Usually the first invocation starts with `source` and `target` being objects.
    // If they are arrays convert top-level array to object
    const target = firstInvocation && Array.isArray(t) ? Object.assign({}, { __array: t }) : t
    const source = firstInvocation && Array.isArray(s) ? Object.assign({}, { __array: s }) : s

    // Also initialize the additions, modifications, and deletions for the first invocation
    if (firstInvocation) {
      if (Array.isArray(source)) {
        additions = []
        modifications = []
        deletions = []
      } else {
        additions = {}
        modifications = {}
        deletions = {}
      }
    }

    // If the target is empty, then all the source is added to additions
    if (t === undefined || t === null || (this.isEmpty(t) && !this.isEmpty(s))) {
      additions = Object.assign(additions, s)
      return ({ additions, modifications, hasChanges: true })
    }

    // Compare the entries in the objects or elements of the array
    // Key is the attribute name or index of the array
    // One of the oddities is when we compare objects, we are only interested in the properties of source
    // So any property in the target that is not in the source is not treated as a deletion
    for (const key in source) {
      // Logic specific for Github
      // API response includes urls for resources, or other ignorable fields; we can ignore them
      if (key.indexOf('url') >= 0 || this.ignorableFields.indexOf(key) >= 0) {
        continue
      }
      const sourceValue = source[key]
      const targetValue = target[key]
      if (targetValue === undefined) {
        if (sourceValue) {
          // The entry is not present in the target and present in source. It is an addition
          additions[key] = sourceValue
          // Retroactively add the id like `name` or `username` to the containers
          // since those are the only fields that can be used to identify the resource
          this.addIdentifyingAttribute(source, key, additions)
        }
      } else if (this.isObject(source[key])) {
        // Initialize the additions, modifications, and deletions with empty objects that can hold the changes
        if (Array.isArray(sourceValue)) {
          additions[key] = []
          modifications[key] = []
          deletions[key] = []
        } else {
          additions[key] = {}
          modifications[key] = {}
          deletions[key] = {} // I don't think this is ever used as we ignore deletions for object properties
        }

        if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
          this.processArrays(key, sourceValue, targetValue, deletions, additions, modifications)
        } else {
          // recursively compare the objects until we reach a primitive
          this.compareDeep(targetValue, sourceValue, additions[key], modifications[key], deletions[key])
          this.validateOverride(key, targetValue, sourceValue)
        }
      } else { // The entry is a simple primitive
        if (targetValue !== sourceValue) {
          // Note: source[key] cannot be undefined here since we are iterating on source keys
          // so we don't need to check for that.
          // The entries are different. It is an addition
          modifications[key] = sourceValue
          // retroactively add `name` or `username` to the modifications
          // Since those are the only fields that can be used to identify the resource
          this.addIdentifyingAttribute(source, key, modifications)
        } else {
          // The entry is the same in both objects
        }
      }

      modifications = this.removeEmptyAndNulls(modifications, key)
      additions = this.removeEmptyAndNulls(additions, key)
      deletions = this.removeEmptyAndNulls(deletions, key)
    }
    // Unwind the topleve array from the object
    if (firstInvocation) {
      if (additions.__array) {
        additions = additions.__array
      }
      if (modifications.__array) {
        modifications = modifications.__array
      }
      if (deletions.__array) {
        deletions = deletions.__array
      }
    }
    return ({ additions, modifications, deletions, hasChanges: !this.isEmpty(additions) || !this.isEmpty(modifications) || !this.isEmpty(deletions) })
  }

  addIdentifyingAttribute (source, key, containerObject) {
    const id = NAME_USERNAME_PROPERTY(source)
    if (id) {
      this.log.debug(`Adding name for ${key} ${source[key]}`)
      containerObject[id] = GET_NAME_USERNAME_PROPERTY(source)
    }
  }

  /**
   *
   * @param {*} key
   * @param {*} source
   * @param {*} target
   * @param {*} deletions
   * @param {*} additions
   * @param {*} modifications
   */
  processArrays (key, source, target, deletions, additions, modifications) {
    // If source array has lesser items than target array, then the missing items are deletions
    if (source.length < target.length) {
      const dels = target.filter(item => {
        if (this.isObjectNotArray(item)) {
          return !source.some(sourceItem => GET_NAME_USERNAME_PROPERTY(item) === GET_NAME_USERNAME_PROPERTY(sourceItem))
        } else {
          return !source.includes(item)
        }
      })
      deletions[key] = dels
    }
    const visited = {}
    const temp = [...source, ...target]
    for (const a of temp) {
      if (this.isObjectNotArray(a)) {
        if (this.compareDeepIfVisited(additions[key], modifications[key], deletions[key], a, visited)) {
          this.validateOverride(key, a, visited)
          continue
        } else {
          // Not visited yet
          const id = GET_NAME_USERNAME_PROPERTY(a)
          if (id) {
            visited[id] = a
          }
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
    if (Object.keys(visited).length !== 0) {
      for (const fields of Object.keys(visited)) {
        combined.push(visited[fields])
      }
      // Elements that are not in target are additions
      additions[key] = combined.filter(item => {
        if (this.isObjectNotArray(item)) {
          return !target.some(targetItem => GET_NAME_USERNAME_PROPERTY(item) === GET_NAME_USERNAME_PROPERTY(targetItem))
        } else {
          return !target.includes(item)
        }
      })
    }
    // Elements that not in source are deletions
    if (combined.length > 0) {
      // Elements that not in source are deletions
      deletions[key] = combined.filter(item => {
        if (this.isObjectNotArray(item)) {
          return !source.some(sourceItem => GET_NAME_USERNAME_PROPERTY(item) === GET_NAME_USERNAME_PROPERTY(sourceItem))
        } else {
          return !source.includes(item)
        }
      })
    }
  }

  compareDeepIfVisited (additions, modifications, deletions, a, visited) {
    const id = GET_NAME_USERNAME_PROPERTY(a)
    if (visited[id]) {
      // Common array in target and source
      modifications.push({})
      additions.push({})
      deletions.push({})
      if (visited[id]) {
        this.compareDeep(a, visited[id], additions[additions.length - 1], modifications[modifications.length - 1], deletions[deletions.length - 1])
      }
      // Any addtions for the matching key must be moved to modifications
      const lastAddition = additions[additions.length - 1]
      const lastModification = modifications[modifications.length - 1]

      if (!this.isEmpty(additions)) {
        for (const key in lastAddition) {
          if (!lastModification[key]) {
            lastModification[key] = Array.isArray(lastAddition[key]) ? [] : {}
          }
          if (!Array.isArray(lastAddition[key])) {
            Object.assign(lastModification[key], lastAddition[key])
          } else {
            lastModification[key].push(...lastAddition[key])
          }
        }
        additions.length = 0
      }
      // Add name attribute to the modifications to make it look better ; it won't be added otherwise as it would be the same
      if (!this.isEmpty(modifications[modifications.length - 1])) {
        if (visited[id]) {
          modifications[modifications.length - 1][NAME_USERNAME_PROPERTY(a)] = id
        }
      }
      if (visited[id]) {
        delete visited[id]
      }
      return true
    }
    return false
  }

  validateOverride (key, baseconfig, overrideconfig) {
    if (!baseconfig || !key || !overrideconfig) {
      return
    }
    if (this.overridevalidators[key]) {
      // this.log.debug(`Calling overridevalidator for key ${key} `)
      if (!this.overridevalidators[key].canOverride(baseconfig, overrideconfig, this.github)) {
        this.log.error(`Error in calling overridevalidator for key ${key} ${this.overridevalidators[key].error}`)
        throw new Error(this.overridevalidators[key].error)
      }
    }
  }

  validateConfig (key, baseconfig) {
    if (this.configvalidators[key]) {
      // this.log.debug(`Calling configvalidator for key ${key} `)
      if (!this.configvalidators[key].isValid(baseconfig, this.github)) {
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
        if (this.isObjectNotArray(source[key]) || Array.isArray(source[key])) {
          // Deep merge Array so that if the same element is there in source and target,
          // override the target with source otherwise include both source and target elements
          if (Array.isArray(source[key]) && Array.isArray(target[key])) {
            const combined = mergeBy(key, this.configvalidators[key], this.overridevalidators[key], NAME_FIELDS, target[key], source[key], this.github)
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

  removeEmptyAndNullsWithoutKeys (modifications) {
    if (Array.isArray(modifications)) {
      modifications = modifications.filter(k => {
        return !this.isEmpty(k)
      })
    }
    return modifications
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
