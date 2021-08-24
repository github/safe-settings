const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs')
const Glob = require('./lib/glob')
const ConfigManager = require('./lib/configManager')
let deploymentConfig
module.exports = (robot, _, Settings = require('./lib/settings')) => {
  async function syncAllSettings (context, repo = context.repo()) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const configManager = new ConfigManager(context)
    //const runtimeConfig = await loadYaml(context)
    const runtimeConfig = await configManager.loadGlobalSettingsYaml();
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log.debug(`config is ${JSON.stringify(config)}`)
    return Settings.syncAll(context, repo, config)
  }

  async function syncSubOrgSettings (context, suborg, repo = context.repo()) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const configManager = new ConfigManager(context)
    //const runtimeConfig = await loadYaml(context)
    const runtimeConfig = await configManager.loadGlobalSettingsYaml();
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log.debug(`config is ${JSON.stringify(config)}`)
    return Settings.syncAll(context, repo, config)
  }


  async function syncSettings (context, repo = context.repo()) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const runtimeConfig = await loadYaml(context)
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log.debug(`config is ${JSON.stringify(config)}`)
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
        //console.error(`Safe-settings load deployment config failed: file ${deploymentConfigPath} not found`)
        //process.exit(1)
        deploymentConfig = { restrictedRepos: [ 'admin', '.github', 'safe-settings' ] }
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
        console.log.error(e)
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

  function getModifiedRepoConfigName(payload) {
    const repoSettingPattern = new Glob(".github/repos/*.yml")

    let commit = payload.commits.find(c => {
      return ( c.modified.find(s => {
        robot.log(JSON.stringify(s))
        return ( s.search(repoSettingPattern)>=0 )
      }) !== undefined )
    })

    if (commit) {
      robot.log.debug(`${JSON.stringify(commit)}`)
      return repo = {repo: commit.modified[0].match(repoSettingPattern)[1], owner: payload.repository.owner.name}
    } else {
      robot.log.debug(`No modifications to repo configs`)
    }
    return undefined
  }

  function getAddedRepoConfigName(payload) {
    const repoSettingPattern = new Glob(".github/repos/*.yml")

    let commit = payload.commits.find(c => {
      return ( c.added.find(s => {
        robot.log.debug(JSON.stringify(s))
        return ( s.search(repoSettingPattern)>=0 )
      }) !== undefined )
    })

    if (commit) {
      robot.log.debug(`${JSON.stringify(commit)}`)
      return repo = {repo: commit.added[0].match(repoSettingPattern)[1], owner: payload.repository.owner.name}
    } else {
      robot.log.debug(`No additions to repo configs`)
    }
    return undefined
  }

  function getAddedSubOrgConfigName(payload) {
    const repoSettingPattern = new Glob(".github/suborgs/*.yml")

    let commit = payload.commits.find(c => {
      return ( c.added.find(s => {
        robot.log.debug(JSON.stringify(s))
        return ( s.search(repoSettingPattern)>=0 )
      }) !== undefined )
    })

    if (commit) {
      robot.log.debug(`${JSON.stringify(commit)}`)
      return {suborg: commit.added[0].match(repoSettingPattern)[1], org: payload.repository.owner.name}
    } else {
      robot.log.debug(`No additions to suborgs configs`)
    }
    return undefined
  }

  function getModifiedSubOrgConfigName(payload) {
    const repoSettingPattern = new Glob(".github/suborgs/*.yml")

    let commit = payload.commits.find(c => {
      return ( c.modified.find(s => {
        robot.log(JSON.stringify(s))
        return ( s.search(repoSettingPattern)>=0 )
      }) !== undefined )
    })

    if (commit) {
      robot.log.debug(`${JSON.stringify(commit)} \n ${commit.modified[0].match(repoSettingPattern)[1]}`)
      return repo = {suborg: commit.modified[0].match(repoSettingPattern)[1], org: payload.repository.owner.name}
    } else {
      robot.log.debug(`No modifications to suborgs configs`)
    }
    return undefined
  }

  robot.on('push', async context => {
    const { payload } = context
    const { repository } = payload

    const adminRepo = repository.name === 'admin'
    if (!adminRepo) {
      //robot.log(`received push event ${JSON.stringify(payload)}`)
      //robot.log('Not working on the Admin repo, returning...')
      return
    }

    const defaultBranch = payload.ref === 'refs/heads/' + repository.default_branch
    if (!defaultBranch) {
      robot.log('Not working on the default branch, returning...')
      return
    }

    //robot.log(`commits ${JSON.stringify(payload.commits)}`)
    const settingsModified = payload.commits.find(commit => {
      return commit.added.includes(Settings.FILE_NAME) ||
        commit.modified.includes(Settings.FILE_NAME)
    })

    let repo = getModifiedRepoConfigName(payload)
    if (repo) {
      return syncSettings(context, repo)
    }

    repo = getAddedRepoConfigName(payload)
    if (repo) {
      return syncSettings(context, repo)
    } 

    let suborg = getModifiedSubOrgConfigName(payload)
    if (suborg) {
      return syncSubOrgSettings(context, suborg)
    }

    suborg = getAddedSubOrgConfigName(payload)
    if (suborg) {
      return syncSubOrgSettings(context, suborg)
    }
    
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
