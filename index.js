/* eslint-disable camelcase */
const yaml = require('js-yaml')
const fs = require('fs')
const cron = require('node-cron')
const Glob = require('./lib/glob')
const ConfigManager = require('./lib/configManager')
const NopCommand = require('./lib/nopcommand')
const env = require('./lib/env')

let deploymentConfig
module.exports = (robot, _, Settings = require('./lib/settings')) => {
  async function syncAllSettings (nop, context, repo = context.repo(), ref) {
    const log = robot.log.child({ context: 'index', repository: repo.repo })
    try {
      deploymentConfig = await loadYamlFileSystem()
      log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
      const configManager = new ConfigManager(context, ref)
      const runtimeConfig = await configManager.loadGlobalSettingsYaml()
      const config = Object.assign({}, deploymentConfig, runtimeConfig)
      log.debug(`config for ref ${ref} is ${JSON.stringify(config)}`)
      if (ref) {
        return Settings.syncAll(nop, context, repo, config, ref)
      } else {
        return Settings.syncAll(nop, context, repo, config)
      }
    } catch (e) {
      if (nop) {
        let filename = env.SETTINGS_FILE_PATH
        if (!deploymentConfig) {
          filename = env.DEPLOYMENT_CONFIG_FILE
          deploymentConfig = {}
        }
        const nopcommand = new NopCommand(filename, repo, null, e, 'ERROR')
        log.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        Settings.handleError(nop, context, repo, deploymentConfig, ref, nopcommand)
      } else {
        throw e
      }
    }
  }

  async function syncSubOrgSettings (nop, context, suborg, repo = context.repo(), ref) {
    const log = robot.log.child({ context: 'index', suborg, repository: repo.repo })
    try {
      deploymentConfig = await loadYamlFileSystem()
      log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
      const configManager = new ConfigManager(context, ref)
      const runtimeConfig = await configManager.loadGlobalSettingsYaml()
      const config = Object.assign({}, deploymentConfig, runtimeConfig)
      log.debug(`config for ref ${ref} is ${JSON.stringify(config)}`)
      return Settings.syncSubOrgs(nop, context, suborg, repo, config, ref)
    } catch (e) {
      if (nop) {
        let filename = env.SETTINGS_FILE_PATH
        if (!deploymentConfig) {
          filename = env.DEPLOYMENT_CONFIG_FILE
          deploymentConfig = {}
        }
        const nopcommand = new NopCommand(filename, repo, null, e, 'ERROR')
        log.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        Settings.handleError(nop, context, repo, deploymentConfig, ref, nopcommand)
      } else {
        throw e
      }
    }
  }

  async function syncSettings (nop, context, repo = context.repo(), ref) {
    const log = robot.log.child({ context: 'index', repository: repo.repo })
    try {
      deploymentConfig = await loadYamlFileSystem()
      log.debug(`deploymentConfig is ${JSON.stringify(deploymentConfig)}`)
      const configManager = new ConfigManager(context, ref)
      const runtimeConfig = await configManager.loadGlobalSettingsYaml()
      const config = Object.assign({}, deploymentConfig, runtimeConfig)
      log.debug(`config for ref ${ref} is ${JSON.stringify(config)}`)
      return Settings.sync(nop, context, repo, config, ref)
    } catch (e) {
      if (nop) {
        let filename = env.SETTINGS_FILE_PATH
        if (!deploymentConfig) {
          filename = env.DEPLOYMENT_CONFIG_FILE
          deploymentConfig = {}
        }
        const nopcommand = new NopCommand(filename, repo, null, e, 'ERROR')
        log.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        Settings.handleError(nop, context, repo, deploymentConfig, ref, nopcommand)
      } else {
        throw e
      }
    }
  }

  /**
   * Loads the deployment config file from file system
   * Do this once when the app starts and then return the cached value
   *
   * @return The parsed YAML file
   */
  async function loadYamlFileSystem () {
    if (deploymentConfig === undefined) {
      const deploymentConfigPath = env.DEPLOYMENT_CONFIG_FILE
      if (fs.existsSync(deploymentConfigPath)) {
        deploymentConfig = yaml.load(fs.readFileSync(deploymentConfigPath))
      } else {
        deploymentConfig = { restrictedRepos: ['admin', '.github', 'safe-settings'] }
      }
    }
    return deploymentConfig
  }

  function getAllChangedSubOrgConfigs (payload) {
    const settingPattern = new Glob('.github/suborgs/*.yml')
    const log = robot.log.child({ context: 'index' })

    // Changes will be an array of files that were added
    const added = payload.commits.map(c => {
      return (c.added.filter(s => {
        log.debug(JSON.stringify(s))
        return (s.search(settingPattern) >= 0)
      }))
    }).flat(2)
    const modified = payload.commits.map(c => {
      return (c.modified.filter(s => {
        log.debug(JSON.stringify(s))
        return (s.search(settingPattern) >= 0)
      }))
    }).flat(2)
    const changes = added.concat(modified)
    const configs = changes.map(file => {
      const matches = file.match(settingPattern)
      log.debug(`${JSON.stringify(file)} \n ${matches[1]}`)
      return { name: matches[1] + '.yml', path: file }
    })
    return configs
  }

  function getAllChangedRepoConfigs (payload, owner) {
    const settingPattern = new Glob('.github/repos/*.yml')
    const log = robot.log.child({ context: 'index' })

    // Changes will be an array of files that were added
    const added = payload.commits.map(c => {
      return (c.added.filter(s => {
        log.debug(JSON.stringify(s))
        return (s.search(settingPattern) >= 0)
      }))
    }).flat(2)
    const modified = payload.commits.map(c => {
      return (c.modified.filter(s => {
        log.debug(JSON.stringify(s))
        return (s.search(settingPattern) >= 0)
      }))
    }).flat(2)
    const changes = added.concat(modified)
    const configs = changes.map(file => {
      log.debug(`${JSON.stringify(file)}`)
      return { repo: file.match(settingPattern)[1], owner }
    })
    return configs
  }

  function getChangedRepoConfigName (glob, files, owner) {
    const log = robot.log.child({ context: 'index' })
    const modifiedFiles = files.filter(s => {
      log.debug(JSON.stringify(s))
      return (s.search(glob) >= 0)
    })

    return modifiedFiles.map(modifiedFile => {
      return { repo: modifiedFile.match(glob)[1], owner }
    })
  }

  function getChangedSubOrgConfigName (glob, files) {
    const log = robot.log.child({ context: 'index' })
    const modifiedFiles = files.filter(s => {
      log.debug(JSON.stringify(s))
      return (s.search(glob) >= 0)
    })

    return modifiedFiles.map(modifiedFile => {
      log.debug(`${JSON.stringify(modifiedFile)}`)
      return { name: modifiedFile.match(glob)[1] + '.yml', path: modifiedFile }
    })
  }

  async function createCheckRun (context, pull_request, head_sha, head_branch) {
    const { payload } = context
    const log = robot.log.child({ context: 'index' })
    log.debug(`Check suite was requested! for ${context.repo()} ${pull_request.number} ${head_sha} ${head_branch}`)
    const res = await context.octokit.checks.create({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      name: 'Safe-setting validator',
      head_sha
    })
    log.debug(JSON.stringify(res, null))
  }

  async function syncInstallation () {
    const log = robot.log.child({ context: 'index' })
    log.trace('Fetching installations')
    const github = await robot.auth()

    const installations = await github.paginate(
      github.apps.listInstallations.endpoint.merge({ per_page: 100 })
    )

    if (installations.length > 0) {
      const installation = installations[0]
      log.trace(`${JSON.stringify(installation)}`)
      const github = await robot.auth(installation.id)
      const context = {
        payload: {
          installation
        },
        octokit: github,
        log: robot.log,
        repo: () => { return { repo: env.ADMIN_REPO, owner: installation.account.login } }
      }
      return syncAllSettings(false, context)
    }
    return null
  }

  robot.on('push', async context => {
    const { payload } = context
    const { repository } = payload
    const log = robot.log.child({ context: 'index', event: 'push', repository: repository.name })

    const adminRepo = repository.name === env.ADMIN_REPO
    if (!adminRepo) {
      return
    }

    const defaultBranch = payload.ref === 'refs/heads/' + repository.default_branch
    if (!defaultBranch) {
      log.debug('Not working on the default branch, returning...')
      return
    }

    const settingsModified = payload.commits.find(commit => {
      return commit.added.includes(Settings.FILE_NAME) ||
        commit.modified.includes(Settings.FILE_NAME)
    })
    if (settingsModified) {
      log.debug(`Changes in '${Settings.FILE_NAME}' detected, doing a full synch...`)
      return syncAllSettings(false, context)
    }

    const repoChanges = getAllChangedRepoConfigs(payload, context.repo().owner)
    if (repoChanges.length > 0) {
      return Promise.all(repoChanges.map(repo => {
        log.debug(`Changes in '${repo}' detected, doing a repo sync...`)
        return syncSettings(false, context, repo)
      }))
    }

    const changes = getAllChangedSubOrgConfigs(payload)
    if (changes.length) {
      return Promise.all(changes.map(suborg => {
        log.debug(`Changes in '${suborg}' detected, doing a suborg sync...`)
        return syncSubOrgSettings(false, context, suborg)
      }))
    }

    log.debug(`No changes in '${Settings.FILE_NAME}' detected, returning...`)
  })

  robot.on('branch_protection_rule', async context => {
    const { payload } = context
    const { sender, repository } = payload
    const log = robot.log.child({ context: 'index', event: 'branch_protection_rule', repository: repository.name })

    if (sender.type === 'Bot') {
      log.debug(`Branch Protection edited by a Bot (${sender.login}), returning...`)
      return
    }
    log.debug(`Branch Protection edited by a Human (${sender.login})`)
    return syncSettings(false, context)
  })

  const member_change_events = [
    'member',
    'team.added_to_repository',
    'team.removed_from_repository',
    'team.edited'
  ]
  robot.on(member_change_events, async context => {
    const { payload } = context
    const { sender, repository } = payload
    const log = robot.log.child({ context: 'index', event: 'member_change_events', repository: repository.name })
    if (sender.type === 'Bot') {
      log.debug(`Repository member edited by a Bot (${sender.login}), returning...`)
      return
    }
    log.debug(`Repository member edited by a Human (${sender.login})`)
    return syncSettings(false, context)
  })

  robot.on('repository.edited', async context => {
    const { payload } = context
    const { changes, repository, sender } = payload
    const log = robot.log.child({ context: 'index', event: 'repository.edited', repository: repository.name })

    if (sender.type === 'Bot') {
      log.debug(`Repository edited by a Bot (${sender.login}), returning...`)
      return
    }
    log.debug(`Repository edited by a Human (${sender.login}`)
    if (!Object.prototype.hasOwnProperty.call(changes, 'default_branch')) {
      log.debug('Repository configuration was edited but the default branch was not affected, returning...')
      return
    }
    log.debug(`Default branch changed from '${changes.default_branch.from}' to '${repository.default_branch}'`)
    return syncSettings(false, context)
  })

  robot.on('check_suite.requested', async context => {
    const { payload } = context
    const { repository } = payload
    const adminRepo = repository.name === env.ADMIN_REPO
    const log = robot.log.child({ context: 'index', event: 'check_suite.requested', repository: repository.name })

    log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      log.debug('Not working on the Admin repo, returning...')
      return
    }
    const defaultBranch = payload.check_suite.head_branch === repository.default_branch
    if (defaultBranch) {
      log.debug(' Working on the default branch, returning...')
      return
    }
    if (!payload.check_suite.pull_requests[0]) {
      log.debug('Not working on a PR, returning...')
      return
    }
    const pull_request = payload.check_suite.pull_requests[0]
    return createCheckRun(context, pull_request, payload.check_suite.head_sha, payload.check_suite.head_branch)
  })

  robot.on('pull_request.opened', async context => {
    const { payload } = context
    const { repository } = payload
    const adminRepo = repository.name === env.ADMIN_REPO
    const log = robot.log.child({ context: 'index', event: 'pull_request.opened', repository: repository.name })

    log.debug('Pull_request opened!')
    log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      log.debug('Not working on the Admin repo, returning...')
      return
    }
    const defaultBranch = payload.pull_request.head_branch === repository.default_branch
    if (defaultBranch) {
      log.debug('Working on the default branch, returning...')
      return
    }
    const pull_request = payload.pull_request
    return createCheckRun(context, pull_request, payload.pull_request.head.sha, payload.pull_request.head.ref)
  })

  robot.on('pull_request.reopened', async context => {
    const { payload } = context
    const { repository } = payload
    const pull_request = payload.pull_request
    const adminRepo = repository.name === env.ADMIN_REPO
    const log = robot.log.child({ context: 'index', event: 'pull_request.reopened', repository: repository.name })

    log.debug('Pull request reopened!')
    log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      log.debug('Not working on the Admin repo, returning...')
      return
    }

    const defaultBranch = payload.pull_request.head_branch === repository.default_branch
    if (defaultBranch) {
      log.debug(' Working on the default branch, returning...')
      return
    }
    return createCheckRun(context, pull_request, payload.pull_request.head.sha, payload.pull_request.head.ref)
  })

  robot.on(['check_suite.rerequested'], async context => {
    const { payload } = context
    const { repository } = payload
    const log = robot.log.child({ context: 'index', event: 'check_suite.rerequested', repository: repository.name })
    log.debug('Check suite was rerequested!')
    return createCheckRun(context)
  })

  robot.on(['check_run.created'], async context => {
    const { payload } = context
    const { repository } = payload
    const { check_run } = payload
    const { check_suite } = check_run
    const pull_request = check_suite.pull_requests[0]
    const source = payload.check_run.name === 'Safe-setting validator'
    const log = robot.log.child({ context: 'index', event: 'check_run.created', repository: repository.name })

    log.debug('Check run was created!')
    if (!source) {
      log.debug('Not triggered by Safe-settings...')
      return
    }

    const adminRepo = repository.name === env.ADMIN_REPO
    log.debug(`Is Admin repo event ${adminRepo}`)
    if (!adminRepo) {
      log.debug('Not working on the Admin repo, returning...')
      return
    }

    if (!pull_request) {
      log.debug('Not working on a PR, returning...')
      return
    }

    let params = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      output: { title: 'Starting NOP', summary: 'initiating...' }
    }
    log.debug(`Updating check run ${JSON.stringify(params)}`)
    await context.octokit.checks.update(params)

    // guarding against null value from upstream libary that is
    // causing a 404 and the check to stall
    // from issue: https://github.com/github/safe-settings/issues/185#issuecomment-1075240374
    if (check_suite.before === '0000000000000000000000000000000000000000') {
      check_suite.before = check_suite.pull_requests[0].base.sha
    }
    params = Object.assign(context.repo(), { basehead: `${check_suite.before}...${check_suite.after}` })
    const changes = await context.octokit.repos.compareCommitsWithBasehead(params)
    const files = changes.data.files.map(f => { return f.filename })

    const settingsModified = files.includes(Settings.FILE_NAME)

    if (settingsModified) {
      log.debug(`Changes in '${Settings.FILE_NAME}' detected, doing a full synch...`)
      return syncAllSettings(true, context, context.repo(), pull_request.head.ref)
    }

    const repoChanges = getChangedRepoConfigName(new Glob('.github/repos/*.yml'), files, context.repo().owner)
    if (repoChanges.length > 0) {
      return Promise.all(repoChanges.map(repo => {
        return syncSettings(true, context, repo, pull_request.head.ref)
      }))
    }

    const subOrgChanges = getChangedSubOrgConfigName(new Glob('.github/suborgs/*.yml'), files, context.repo().owner)
    if (subOrgChanges.length) {
      return Promise.all(subOrgChanges.map(suborg => {
        return syncSubOrgSettings(true, context, suborg, context.repo(), pull_request.head.ref)
      }))
    }

    // if no safe-settings changes detected, send a success to the check run
    params = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'completed',
      completed_at: new Date().toISOString(),
      conclusion: 'success',
      output: { title: 'No Safe-settings changes detected', summary: 'No changes detected' }
    }
    log.debug(`Completing check run ${JSON.stringify(params)}`)
    await context.octokit.checks.update(params)
  })

  robot.on('repository.created', async context => {
    const { payload } = context
    const { sender, repository } = payload
    const log = robot.log.child({ context: 'index', event: 'repository.created', repository: repository.name })

    log.debug('repository.created payload from ', JSON.stringify(sender))
    return syncSettings(false, context)
  })

  if (process.env.CRON) {
    /*
    # ┌────────────── second (optional)
    # │ ┌──────────── minute
    # │ │ ┌────────── hour
    # │ │ │ ┌──────── day of month
    # │ │ │ │ ┌────── month
    # │ │ │ │ │ ┌──── day of week
    # │ │ │ │ │ │
    # │ │ │ │ │ │
    # * * * * * *
    */
    cron.schedule(process.env.CRON, () => {
      const log = robot.log.child({ event: 'cron' })
      log.debug(`running a scheduled task (${process.env.CRON})`)
      syncInstallation()
    })
  }

  return {
    syncInstallation
  }
}
