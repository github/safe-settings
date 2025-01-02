const yaml = require('js-yaml')
const fs = require('fs')
const env = require('./env')

/**
 * Class representing a deployment config.
 * It is a singleton (class object) for the deployment settings.
 * The settings are loaded from the deployment-settings.yml file during initialization and stored as static properties.
 */
class DeploymentConfig {
  // static config
  static configvalidators = {}
  static overridevalidators = {}

  static {
    const deploymentConfigPath = process.env.DEPLOYMENT_CONFIG_FILE ? process.env.DEPLOYMENT_CONFIG_FILE : 'deployment-settings.yml'
    if (fs.existsSync(deploymentConfigPath)) {
      this.config = yaml.load(fs.readFileSync(deploymentConfigPath))
    } else {
      this.config = { restrictedRepos: ['admin', '.github', 'safe-settings'] }
    }

    const overridevalidators = this.config.overridevalidators
    if (this.isIterable(overridevalidators)) {
      for (const validator of overridevalidators) {
        // eslint-disable-next-line no-new-func
        const f = new Function('baseconfig', 'overrideconfig', 'githubContext', validator.script)
        this.overridevalidators[validator.plugin] = { canOverride: f, error: validator.error }
      }
    }
    const configvalidators = this.config.configvalidators
    if (this.isIterable(configvalidators)) {
      for (const validator of configvalidators) {
        // eslint-disable-next-line no-new-func
        const f = new Function('baseconfig', 'githubContext', validator.script)
        this.configvalidators[validator.plugin] = { isValid: f, error: validator.error }
      }
    }
  }

  static isIterable (obj) {
    // checks for null and undefined
    if (obj == null) {
      return false
    }
    return typeof obj[Symbol.iterator] === 'function'
  }

  // eslint-disable-next-line no-useless-constructor
  constructor (nop, context, repo, config, ref, suborg) {
  }
}
DeploymentConfig.FILE_NAME = `${env.CONFIG_PATH}/settings.yml`

module.exports = DeploymentConfig
