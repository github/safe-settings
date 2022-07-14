class Glob {
    constructor(glob) {
        this.glob = glob
        let regexptex = glob.replace(/\//g,"\\/").replace(/\?/g, "([^\\/])").replace(/\./g, "\\.").replace(/\*/g, "([^\\/]*)")
        this.regexp = new RegExp(`^${regexptex}$`, "u")                       
    }

    toString() {
        return this.glob
    }

    [Symbol.search](s) {
        return s.search(this.regexp)
    }
    [Symbol.match](s) {
        return s.match(this.regexp)
    }
    [Symbol.replace](s, replacement) {
        return s.replace(this.regexp, replacement)
    }
    [Symbol.replaceAll](s, replacement) {
        return s.replaceAll(this.regexp, replacement)
    }
}
module.exports = Glob