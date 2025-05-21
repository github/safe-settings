const { minimatch } = require('minimatch')

class Glob {
  constructor (pattern, options = {}) {
    this.pattern = pattern
    this.options = options
  }

  test (input) {
    return minimatch(input, this.pattern, this.options)
  }
}

module.exports = Glob
