const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs')
module.exports = class ConfigManager {
    constructor(context) {
        this.context = context
    }

    /**
 * Loads a file from GitHub
 *
 * @param params Params to fetch the file with
 * @return The parsed YAML file
 */
    async loadGlobalSettingsYaml() {
        try {
            const repo = { owner: this.context.repo().owner, repo: 'admin' }
            const CONFIG_PATH = '.github'
            const params = Object.assign(repo, { path: path.posix.join(CONFIG_PATH, 'settings.yml') })
            const response = await this.context.octokit.repos.getContent(params).catch(e => {
                console.log(e)
                console.error(`Error getting settings ${e}`)
            })
            // Ignore in case path is a folder
            // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-directory
            if (Array.isArray(response.data)) {
                return null
            }

            // we don't handle symlinks or submodule
            // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-symlink
            // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-submodule
            if (typeof response.data.content !== 'string') {
                return
            }

            return yaml.load(Buffer.from(response.data.content, 'base64').toString()) || {}
        } catch (e) {
            if (e.status === 404) {
                return null
            }

            throw e
        }
    }
}
