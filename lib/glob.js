const { minimatch } = require('minimatch')

class Glob {
  constructor (pattern, options = {}) {
    this.pattern = pattern
    this.options = options
  }

  test (input) {
    // Detect if pattern looks like regex (has regex-specific characters)
    if (this.isRegexPattern(this.pattern)) {
      try {
        const regex = new RegExp(this.pattern)
        return regex.test(input)
      } catch (e) {
        // If regex parsing fails, fall back to glob
        result = minimatch(input, this.pattern, this.options)
      }
    } else {
      // Use glob pattern matching
      result = minimatch(input, this.pattern, this.options)
    }
    return result
  }

  isRegexPattern (pattern) {
    // Check for common regex indicators
    return pattern.includes('^') || 
           pattern.includes('$') || 
           pattern.includes('.*') || 
           pattern.includes('\\') ||
           (pattern.includes('[') && pattern.includes(']') && pattern.includes('^'))
  }
}

module.exports = Glob
