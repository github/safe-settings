const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs')
let deploymentConfig
module.exports = (robot, _, Settings = require('./lib/settings')) => {
  async function syncAllSettings (context, repo = context.repo()) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const runtimeConfig = await loadYaml(context)
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log(`config is ${JSON.stringify(config)}`)
    return Settings.syncAll(context, repo, config)
  }

  async function syncSettings (context, repo = context.repo()) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const runtimeConfig = await loadYaml(context)
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log(`config is ${JSON.stringify(config)}`)
    return Settings.sync(context, repo, config)
  }

  /**
   * Loads the deployment config file from file system
   * Do this once when the app starts and then return the cached value
   *
   * @return The parsed YAML file
   */
  async function loadYamlFileSystem () {
    if (deploymentConfig === undefined) {
      const deploymentConfigPath = process.env.DEPLOYMENT_CONFIG_FILE ? process.env.DEPLOYMENT_CONFIG_FILE : 'deployment-settings.yml'
      if (fs.existsSync(deploymentConfigPath)) {
        deploymentConfig = yaml.load(fs.readFileSync(deploymentConfigPath))
      } else {
        console.error(`Safe-settings load deployment config failed: file ${deploymentConfigPath} not found`)
        process.exit(1)
      }
    }
    return deploymentConfig
  }

  /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async function loadYaml (context) {
    try {
      const repo = { owner: context.repo().owner, repo: 'admin' }
      const CONFIG_PATH = '.github'
      const params = Object.assign(repo, { path: path.posix.join(CONFIG_PATH, 'settings.yml') })
      const response = await context.octokit.repos.getContent(params).catch(e => {
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

  robot.on('push', async context => {
    const { payload } = context
    const { repository } = payload

    const adminRepo = repository.name === 'admin'
    if (!adminRepo) {
      robot.log('Not working on the Admin repo, returning...')
      return
    }

    const defaultBranch = payload.ref === 'refs/heads/' + repository.default_branch
    if (!defaultBranch) {
      robot.log('Not working on the default branch, returning...')
      return
    }

    const settingsModified = payload.commits.find(commit => {
      return commit.added.includes(Settings.FILE_NAME) ||
        commit.modified.includes(Settings.FILE_NAME)
    })

    if (!settingsModified) {
      robot.log(`No changes in '${Settings.FILE_NAME}' detected, returning...`)
      return
    }
    return syncAllSettings(context)
  })

  robot.on('repository.edited', async context => {
    const { payload } = context
    const { changes, repository, sender } = payload
    robot.log('repository.edited payload from ', JSON.stringify(sender))
    if (sender.type === 'Bot') {
      robot.log('Repository Edited by a Bot')
      return
    }
    console.log('Repository Edited by a Human')
    if (!Object.prototype.hasOwnProperty.call(changes, 'default_branch')) {
      robot.log('Repository configuration was edited but the default branch was not affected, returning...')
      return
    }

    robot.log(`Default branch changed from '${changes.default_branch.from}' to '${repository.default_branch}'`)

    return syncSettings(context)
  })

  robot.on('repository.created', async context => {
    const { payload } = context
    const { sender } = payload
    robot.log('repository.created payload from ', JSON.stringify(sender))
    if (sender.type === 'Bot') {
      robot.log('Repository created by a Bot')
      return
    }
    robot.log('Repository created by a Human')
    return syncSettings(context)
  })
}
