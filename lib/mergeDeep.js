class MergeDeep {
  constructor (log, ignorableFields) {
    this.log = log
    this.ignorableFields = ignorableFields
  }

  isObject (item) {
    return (item && typeof item === 'object' && !Array.isArray(item))
  }

  isEmpty (item) {
    if (this.isObject(item)) {
      return Object.keys(item).length === 0
    } else if (Array.isArray(item)) {
      return item.length === 0
    } else {
      return item === undefined
    }
  }

  compareDeep (t, s, additions = [], modifications = []) {
    const target = Object.assign({}, t)
    const source = Object.assign({}, s)
    if (t === undefined) {
      additions = Object.assign(additions, s)
    }
    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (key.indexOf('url') >= 0 || this.ignorableFields.indexOf(key) >= 0) {
          continue
        }
        if (this.isObject(source[key]) || Array.isArray(source[key])) {
          /*
                    if (!target[key]) {
                        if (Array.isArray(source[key])) {
                            additions = Object.assign({}, {
                                [key]: []
                            })

                        } else {
                            additions = Object.assign({}, {
                                [key]: {}
                            })
                        }
                    } else {
                        if (Array.isArray(source[key])) {
                            modifications = Object.assign({}, {
                                [key]: []
                            })
                        } else {
                            modifications = Object.assign({}, {
                                [key]: {}
                            })
                        }

                    }
                    */

          if (Array.isArray(source[key])) {
            additions[key] = []
            modifications[key] = []
          } else {
            additions[key] = {}
            modifications[key] = {}
          }

          if (Array.isArray(source[key]) && Array.isArray(target[key])) {
            // Deep merge Array so that if the same element is there in source and target,
            // override the target with source otherwise include both source and target elements
            const visited = {}
            const temp = [...source[key], ...target[key]]
            this.log.debug(`merging array ${JSON.stringify(temp)}`)
            console.log(`merging array ${JSON.stringify(temp)}`)
            for (const a of temp) {
              if (this.isObject(a)) {
                if (visited[a.name]) {
                  // Common array in target and source
                  modifications[key].push({})
                  additions[key].push({})
                  this.log.debug(`going deeper in compare array elements objects for ${key}  ${JSON.stringify(visited[a.username], null, 2)},  ${JSON.stringify(a, null, 2)}, ${JSON.stringify(additions[key][additions[key].length - 1])}, ${JSON.stringify(modifications[key][modifications[key].length - 1])}`)
                  console.log(`going deeper in compare array elements objects for sss ${key}  ${JSON.stringify(visited[a.username], null, 2)},  ${JSON.stringify(a, null, 2)}, ${JSON.stringify(additions[key][additions[key].length - 1])}, ${JSON.stringify(modifications[key][modifications[key].length - 1])}`)
                  this.compareDeep(a, visited[a.name], additions[key][additions[key].length - 1], modifications[key][modifications[key].length - 1])
                  delete visited[a.name]
                  continue
                } else if (visited[a.username]) {
                  // Common array in target and source
                  modifications[key].push({})
                  additions[key].push({})
                  this.log.debug(`going deeper in compare array elements objects for ${key}  ${JSON.stringify(visited[a.username], null, 2)},  ${JSON.stringify(a, null, 2)}, ${JSON.stringify(additions[key][additions[key].length - 1])}, ${JSON.stringify(modifications[key][modifications[key].length - 1])}`)
                  console.log(`going deeper in compare array elements objects for aaa ${key}  ${JSON.stringify(visited[a.username], null, 2)},  ${JSON.stringify(a, null, 2)}, ${JSON.stringify(additions[key][additions[key].length - 1])}, ${JSON.stringify(modifications[key][modifications[key].length - 1])}`)
                  this.compareDeep(visited[a.username], a, additions[key][additions[key].length - 1], modifications[key][modifications[key].length - 1])
                  delete visited[a.username]
                  continue
                }
                if (a.name) {
                  visited[a.name] = a
                } else if (a.username) {
                  visited[a.username] = a
                }
              } else {
                // If already seen this, it is not a missing field
                if (visited[a]) {
                  console.log(`I am here ${a}`)
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
            additions[key] = combined
          } else {
            this.log.debug(`going deeper in compare 2 objects for ${key} : ${JSON.stringify(target[key])},  ${JSON.stringify(source[key])}, ${JSON.stringify(additions[key])}, ${JSON.stringify(modifications[key])}`)
            console.log(`going deeper in compare 2 objects for aaa ${key} : ${JSON.stringify(target[key])},  ${JSON.stringify(source[key])}, ${JSON.stringify(additions[key])}, ${JSON.stringify(modifications[key])}`)
            this.compareDeep(target[key], source[key], additions[key], modifications[key])
          }
        } else {
          this.log.debug(`Checking for property ${key} ${target[key]} ${source[key]}`)
          console.log(`Checking for property ${key} ${target[key]} ${source[key]}`)
          if (target[key] === undefined) {
            if (source[key]) {
              additions[key] = source[key]
            }
            // delete modifications[key]
          } else if (target[key] !== source[key]) {
            modifications[key] = source[key]
            // delete additions[key]
          }
        }
        if (this.isEmpty(modifications[key])) {
          delete modifications[key]
        }
        if (this.isEmpty(additions[key])) {
          delete additions[key]
        }
      }
    }
    // return ({ target, source, additions, modifications });
    return ({ additions, modifications })
  }
}
module.exports = MergeDeep
