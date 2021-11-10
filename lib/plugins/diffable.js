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
module.exports = class Diffable {
  constructor (nop, github, repo, entries, log) {
    this.github = github
    this.repo = repo
    this.entries = entries
    this.log = log
    this.nop = nop
  }

  filterEntries () {
    let filteredEntries = Array.from(this.entries)
    //this.log.debug(` entries ${JSON.stringify(filteredEntries)}`)
    filteredEntries = filteredEntries.filter( attrs => {
      if (Array.isArray(attrs.exclude)) {
        if (!attrs.exclude.includes(this.repo.repo)) {
          //this.log.debug(`returning not excluded entry = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return true
        } else {
          //this.log.debug(`skipping excluded entry = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return false
        }
      } else {
        //this.log.debug(`No excludes. Returning unfiltered entries = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
        return true
      }
    })
    filteredEntries = filteredEntries.filter( attrs => {
      if (Array.isArray(attrs.include)) {
        if (attrs.include.includes(this.repo.repo)) {
          //this.log.debug(`returning included entry  = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return true
        } else {
          //this.log.debug(`skipping not included entry = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
          return false
        }
      } else {
        //this.log.debug(`No includes. Returning unfiltered entries = ${JSON.stringify(attrs)} for repo ${this.repo.repo}`)
        return true
      }
    })
    filteredEntries = filteredEntries.map(e => {

      let o = new Object();
      for (const key in e) {
        if (key !== 'include' && key !== 'exclude') {
          Object.assign(o, {
            [key]: e[key]
          })
        }
      }
      
      return o
      })
    return filteredEntries
  }
  sync () {
    if (this.entries) {
      let filteredEntries = this.filterEntries()
      //this.log.debug(`filtered entries are ${JSON.stringify(filteredEntries)}`)
      return this.find().then(existingRecords => {
        const changes = []

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

        existingRecords.forEach(x => {
          if (!filteredEntries.find(y => this.comparator(x, y))) {
            changes.push(this.remove(x))
          }
        })
        if (changes.length === 0) {
          if (this.nop) {
            return Promise.resolve([
              //{plugin: this.constructor.name, repo: this.repo, action: `No changes`},
            ])
          }
        }
        return Promise.all(changes)
      }).catch(e => {
        console.log(`error calling find for ${this.constructor.name} ${e}`)
      })


    }
  }
}
