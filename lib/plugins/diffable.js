// Base class to make it easy to check for changes to a list of items
//
//     class Thing extends Diffable {
//       find() {
//       }
//
//       comparator(existing, attrs) {
//       }
//
//       changed(existing, attrs) {
//       }
//
//       update(existing, attrs) {
//       }
//
//       add(attrs) {
//       }
//
//       remove(existing) {
//       }
//     }
const MergeDeep = require('../mergeDeep')
const NopCommand = require('../nopcommand')
const ignorableFields = ['id', 'node_id', 'default', 'url']
module.exports = class Diffable {
  constructor (nop, github, repo, entries, log) {
    this.github = github
    this.repo = repo
    this.entries = entries
    this.log = log.child({ plugin: this.constructor.name, repository: this.repo.repo })
    this.nop = nop
  }

  filterEntries () {
    let filteredEntries = Array.from(this.entries)

    // this.log.debug(` entries ${JSON.stringify(filteredEntries)}`)
    filteredEntries = filteredEntries.filter(attrs => {
      if (Array.isArray(attrs.exclude)) {
        if (!attrs.exclude.includes(this.repo.repo)) {
          // this.log.debug(`returning not excluded entry = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return true
        } else {
          // this.log.debug(`skipping excluded entry = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return false
        }
      } else {
        // this.log.debug(`No excludes. Returning unfiltered entries = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
        return true
      }
    })
    filteredEntries = filteredEntries.filter(attrs => {
      if (Array.isArray(attrs.include)) {
        if (attrs.include.includes(this.repo.repo)) {
          // this.log.debug(`returning included entry  = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return true
        } else {
          // this.log.debug(`skipping not included entry = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return false
        }
      } else {
        // this.log.debug(`No includes. Returning unfiltered entries = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
        return true
      }
    })
    filteredEntries = filteredEntries.map(e => {
      const { exclude, include, ...o } = e
      return o
    })
    return filteredEntries
  }

  sync () {
    if (this.entries) {
      let filteredEntries = this.filterEntries()
      // this.log.debug(`filtered entries are ${JSON.stringify(filteredEntries)}`)
      return this.find().then(existingRecords => {
        const mergeDeep = new MergeDeep(this.log, ignorableFields)
        const compare = mergeDeep.compareDeep(existingRecords, filteredEntries)
        const results = JSON.stringify(compare, null, 2)
        this.log.debug(`Results of comparing ${this.constructor.name} diffable target ${JSON.stringify(existingRecords)} with source ${JSON.stringify(filteredEntries)} is ${results}`)
        if (!compare.hasChanges) {
          this.log.debug(`There are no changes for ${this.constructor.name} for repo ${this.repo}. Skipping changes`)
          if (this.nop) {
            return Promise.resolve([(new NopCommand(this.constructor.name, this.repo, null, `${this.constructor.name} settings has ${compare.additions.length} additions and ${compare.modifications.length} modifications`))])
          }
          return Promise.resolve()
        }

        // Filter out all empty entries (usually from repo override)
        for (const entry of filteredEntries) {
          for (const key of Object.keys(entry)) {
            if (entry[key] === null || entry[key] === undefined) {
              delete entry[key]
            }
          }
        }
        filteredEntries = filteredEntries.filter(entry => Object.keys(entry).filter(key => !MergeDeep.NAME_FIELDS.includes(key)).length !== 0)

        const changes = []

        existingRecords.forEach(x => {
          if (!filteredEntries.find(y => this.comparator(x, y))) {
            changes.push(this.remove(x))
          }
        })

        filteredEntries.forEach(attrs => {
          const existing = existingRecords.find(record => {
            return this.comparator(record, attrs)
          })

          if (!existing) {
            changes.push(this.add(attrs))
          } else if (this.changed(existing, attrs)) {
            changes.push(this.update(existing, attrs))
          }
        })

        if (changes.length === 0) {
          if (this.nop) {
            return Promise.resolve([
              // {plugin: this.constructor.name, repo: this.repo, action: `No changes`},
            ])
          }
        }
        return Promise.all(changes)
      }).catch(e => {
        this.log.error(`error calling find for ${this.constructor.name} for repo: ${JSON.stringify(this.repo)} entries ${JSON.stringify(this.entries)}\n`, e)
      })
    }
  }
}
