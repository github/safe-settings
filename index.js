const path = require('path')
const yaml = require('js-yaml')
const fs = require('fs')
const Glob = require('./lib/glob')
const ConfigManager = require('./lib/configManager')
let deploymentConfig
module.exports = (robot, _, Settings = require('./lib/settings')) => {
  
  async function syncAllSettings (nop, context, repo = context.repo(), ref) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const configManager = new ConfigManager(context)
    const runtimeConfig = await configManager.loadGlobalSettingsYaml();
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log.debug(`config is ${JSON.stringify(config)}`)
    if (ref) {
      return Settings.syncAll(nop, context, repo, config, ref)
    } else {
      return Settings.syncAll(nop, context, repo, config)
    }
  }

  async function syncSubOrgSettings (nop, context, suborg, repo = context.repo(), ref) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const configManager = new ConfigManager(context)
    const runtimeConfig = await configManager.loadGlobalSettingsYaml();
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log.debug(`config is ${JSON.stringify(config)}`)
    return Settings.syncAll(nop, context, repo, config, ref)
  }

  async function syncSettings (nop, context, repo = context.repo(), ref) {
    deploymentConfig = await loadYamlFileSystem()
    robot.log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
    const runtimeConfig = await loadYaml(context)
    const config = Object.assign({}, deploymentConfig, runtimeConfig)
    robot.log.debug(`config is ${JSON.stringify(config)}`)
    return Settings.sync(nop, context, repo, config, ref)
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
        robot.log.debug(JSON.stringify(s))
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
        robot.log.debug(JSON.stringify(s))
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

  function getChangedConfigName(glob, files, owner) {
    let modifiedFile = files.find(s => {
        return ( s.search(glob)>=0 )
    })

    if (modifiedFile) {
      robot.log.debug(`${JSON.stringify(modifiedFile)}`)
      return repo = {repo: modifiedFile.match(glob)[1], owner: owner}
    } else {
      robot.log.debug(`No changes to repo configs`)
    }
    return undefined
  }

  async function createCheckRun(context, pull_request, head_sha, head_branch) {
    const { payload } = context
    const { repository } = payload
    robot.log.debug(`Check suite was requested! for ${context.repo()} ${pull_request.number} ${head_sha} ${head_branch}`)
    const res = await context.octokit.checks.create({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      name: 'Safe-setting validator',
      head_sha: head_sha
    })
    robot.log.debug(JSON.stringify(res,null))
  }


  robot.on('push', async context => {
    const { payload } = context
    const { repository } = payload

    const adminRepo = repository.name === 'admin'
    if (!adminRepo) {
      return
    }

    const defaultBranch = payload.ref === 'refs/heads/' + repository.default_branch
    if (!defaultBranch) {
      robot.log.debug('Not working on the default branch, returning...')
      return
    }
    const settingsModified = payload.commits.find(commit => {
      return commit.added.includes(Settings.FILE_NAME) ||
        commit.modified.includes(Settings.FILE_NAME)
    })

    let repo = getModifiedRepoConfigName(payload)
    if (repo) {
      return syncSettings(false, context, repo)
    }

    repo = getAddedRepoConfigName(payload)
    if (repo) {
      return syncSettings(false, context, repo)
    } 

    let suborg = getModifiedSubOrgConfigName(payload)
    if (suborg) {
      return syncSubOrgSettings(false, context, suborg)
    }

    suborg = getAddedSubOrgConfigName(payload)
    if (suborg) {
      return syncSubOrgSettings(false, context, suborg)
    }
    
    if (!settingsModified) {
      robot.log.debug(`No changes in '${Settings.FILE_NAME}' detected, returning...`)
      return
    }
    return syncAllSettings(false, context)
  })

  robot.on('branch_protection_rule', async context => {
    const { payload } = context
    const { changes, repository, sender } = payload
    robot.log.debug('Branch Protection edited by ', JSON.stringify(sender))
    if (sender.type === 'Bot') {
      robot.log.debug('Branch Protection edited by Bot')
      return
    }
    console.log('Branch Protection edited by a Human')
    return syncSettings(false, context)
  })


  robot.on('repository.edited', async context => {
    const { payload } = context
    const { changes, repository, sender } = payload
    robot.log.debug('repository.edited payload from ', JSON.stringify(sender))
    if (sender.type === 'Bot') {
      robot.log.debug('Repository Edited by a Bot')
      return
    }
    console.log('Repository Edited by a Human')
    if (!Object.prototype.hasOwnProperty.call(changes, 'default_branch')) {
      robot.log.debug('Repository configuration was edited but the default branch was not affected, returning...')
      return
    }
    robot.log.debug(`Default branch changed from '${changes.default_branch.from}' to '${repository.default_branch}'`)
    return syncSettings(false, context)
  })

  robot.on('check_suite.requested', async context => {
    const { payload } = context
    const { repository } = payload
    const adminRepo = repository.name === 'admin'
    robot.log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      robot.log.debug('Not working on the Admin repo, returning...')
      return
    }
    const defaultBranch = payload.check_suite.head_branch ===  repository.default_branch
    if (defaultBranch) {
      robot.log.debug(' Working on the default branch, returning...')
      return
    }
    if (!payload.check_suite.pull_requests[0]) {
      robot.log.debug('Not working on a PR, returning...')
      return
    }
    const pull_request = payload.check_suite.pull_requests[0]
    createCheckRun(context, pull_request, payload.check_suite.head_sha, payload.check_suite.head_branch)
  })

  robot.on('pull_request.opened', async context => {
    robot.log.debug('Pull_request opened !')
    const { payload } = context
    const { repository } = payload
    const adminRepo = repository.name === 'admin'
    robot.log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      robot.log.debug('Not working on the Admin repo, returning...')
      return
    }
    const defaultBranch = payload.pull_request.head_branch ===  repository.default_branch
    if (defaultBranch) {
      robot.log.debug(' Working on the default branch, returning...')
      return
    }
    const pull_request = payload.pull_request
    console.log(JSON.stringify(pull_request,null,2))
    createCheckRun(context,pull_request, payload.pull_request.head.sha, payload.pull_request.head.ref)
  })

  robot.on('pull_request.reopened', async context => {
    robot.log.debug('Pull_request REopened !')
    const { payload } = context
    const { repository } = payload
    const pull_request = payload.pull_request
    const adminRepo = repository.name === 'admin'

    robot.log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      robot.log.debug('Not working on the Admin repo, returning...')
      return
    }

    const defaultBranch = payload.pull_request.head_branch ===  repository.default_branch
    if (defaultBranch) {
      robot.log.debug(' Working on the default branch, returning...')
      return
    }
    console.log(JSON.stringify(pull_request,null,2))
    createCheckRun(context,pull_request, payload.pull_request.head.sha, payload.pull_request.head.ref)
  })

  robot.on([ 'check_suite.rerequested'], async context => {
    robot.log.debug('Check suite was rerequested!')
    createCheckRun(context)
  })

  robot.on([ 'check_suite.rerequested'], async context => {
    robot.log.debug('Check suite was rerequested!')
    createCheckRun(context)
  })

  robot.on([ 'check_run.created'], async context => {
    robot.log.debug(`Check run was created!`)
    const { payload } = context
    const { repository } = payload
    const { check_run } = payload
    const { check_suite } = check_run
    const pull_request = check_suite.pull_requests[0]
    const source = payload.check_run.name ===  "Safe-setting validator"
    if (!source) {
      robot.log.debug(' Not triggered by Safe-settings...')
      return
    }

    const adminRepo = repository.name === 'admin'
    robot.log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      robot.log.debug('Not working on the Admin repo, returning...')
      return
    }

    if (!pull_request) {
      robot.log.debug('Not working on a PR, returning...')
      return
    }

    let params = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'in_progress',
      started_at: new Date((new Date()).setUTCHours(0, 0, 0, 0)).toISOString(),
      output: { title: "Starting NOP", summary: "initiating..."}
    }
    robot.log.debug(`Updating check run ${JSON.stringify(params)}`)
    let res = await context.octokit.checks.update(params)
    params = Object.assign(context.repo(), {  basehead: `${check_suite.before}...${check_suite.after}`  })
    const changes = await context.octokit.repos.compareCommitsWithBasehead(params)
    const files = changes.data.files.map(f => { return f.filename })
    const repo = getChangedConfigName(new Glob(".github/repos/*.yml"), files, context.repo().owner)
    robot.log.debug(`${JSON.stringify(repo, null, 4)}`)
    if (repo) {
      return syncSettings(true, context, repo, pull_request.head.ref)
    }
    const suborg = getChangedConfigName(new Glob(".github/suborgs/*.yml"), files, context.repo().owner)
    if (suborg) {
      return syncAllSettings(true, context, suborg, pull_request.head.ref )
    }
    return syncAllSettings(true, context, context.repo(), pull_request.head.ref )
  })
  
  robot.on('repository.created', async context => {
    const { payload } = context
    const { sender } = payload
    robot.log.debug('repository.created payload from ', JSON.stringify(sender))
    if (sender.type === 'Bot') {
      robot.log.debug('Repository created by a Bot')
      return
    }
    robot.log.debug('Repository created by a Human')
    return syncSettings(false, context)
  })
  
}
