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
const ErrorStash = require('./errorStash')
const MergeDeep = require('../mergeDeep')
const NopCommand = require('../nopcommand')
const ignorableFields = ['id', 'node_id', 'default', 'url']
module.exports = class Diffable extends ErrorStash {
  constructor (nop, github, repo, entries, log, errors, filterNameFields) {
    super(errors)
    this.github = github
    this.repo = repo
    this.entries = entries
    this.log = log
    this.nop = nop
    this.filterNameFields = filterNameFields ?? MergeDeep.NAME_FIELDS
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
    const resArray = []
    if (this.entries) {
      let filteredEntries = this.filterEntries()
      // this.log.debug(`filtered entries are ${JSON.stringify(filteredEntries)}`)
      return this.find().then(existingRecords => {
        this.log.debug(` ${JSON.stringify(existingRecords, null, 2)} \n\n ${JSON.stringify(filteredEntries, null, 2)} `)

        const mergeDeep = new MergeDeep(this.log, this.github, ignorableFields)
        const compare = mergeDeep.compareDeep(existingRecords, filteredEntries)
        const results = { msg: 'Changes found', additions: compare.additions, modifications: compare.modifications, deletions: compare.deletions }
        this.log.debug(`Results of comparing ${this.constructor.name} diffable target ${JSON.stringify(existingRecords)} with source ${JSON.stringify(filteredEntries)} is ${results}`)
        if (!compare.hasChanges) {
          this.log.debug(`There are no changes for ${this.constructor.name} for repo ${this.repo}. Skipping changes`)
          return Promise.resolve()
        } else {
          if (this.nop) {
            resArray.push(new NopCommand(this.constructor.name, this.repo, null, results, 'INFO'))
          }
        }

        // Remove any null or undefined values from the diffables (usually comes from repo override)
        for (const entry of filteredEntries) {
          for (const key of Object.keys(entry)) {
            if (entry[key] === null || entry[key] === undefined) {
              delete entry[key]
            }
          }
        }
        // Delete any diffable that now only has name and no other attributes
        filteredEntries = filteredEntries.filter(entry => Object.keys(entry).filter(key => !this.filterNameFields.includes(key)).length !== 0)

        const changes = []

        existingRecords.forEach(x => {
          if (!filteredEntries.find(y => this.comparator(x, y))) {
            const change = this.remove(x).then(res => {
              if (this.nop) {
                return resArray.push(res)
              }
              return res
            })
            changes.push(change)
          }
        })

        filteredEntries.forEach(attrs => {
          const existing = existingRecords.find(record => {
            return this.comparator(record, attrs)
          })

          if (!existing) {
            const change = this.add(attrs).then(res => {
              if (this.nop) {
                return resArray.push(res)
              }
              return res
            })
            changes.push(change)
          } else if (this.changed(existing, attrs)) {
            const change = this.update(existing, attrs).then(res => {
              if (this.nop) {
                return resArray.push(res)
              }
              return res
            })
            changes.push(change)
          }
        })

        // if (changes.length === 0) {
        //   if (this.nop) {
        //     return Promise.resolve([
        //       // {plugin: this.constructor.name, repo: this.repo, action: `No changes`},
        //     ])
        //   }
        // }
        if (this.nop) {
          return Promise.resolve(resArray)
        }
        return Promise.all(changes)
      }).catch(e => {
        if (this.nop) {
          if (e.status === 404) {
            // Ignore 404s which can happen in dry-run as the repo may not exist.
            return Promise.resolve(resArray)
          } else {
            resArray.push(new NopCommand(this.constructor.name, this.repo, null, `error ${e} in ${this.constructor.name} for repo: ${JSON.stringify(this.repo)} entries ${JSON.stringify(this.entries)}`, 'ERROR'))
            return Promise.resolve(resArray)
          }
        } else {
          this.logError(`Error ${e} in ${this.constructor.name} for repo: ${JSON.stringify(this.repo)} entries ${JSON.stringify(this.entries)}`)
        }
      })
    }
  }
}
