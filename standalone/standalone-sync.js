#!/usr/bin/env node

/**
 * Standalone sync script for safe-settings
 * Runs without webhooks or GitHub App server
 * Designed to be run from GitHub Actions or command line
 *
 * This is a thin adapter over the core Settings class that overrides:
 * 1. Config loading - reads from filesystem instead of GitHub API
 * 2. Repo listing - uses repos.listForOrg instead of /installation/repositories
 * 3. Result handling - prints to stdout instead of creating check runs
 *
 * All merging, plugin orchestration, suborg logic, and validation
 * is inherited from the core Settings class.
 */

const { Octokit } = require('@octokit/rest')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const Settings = require('../lib/settings')
const env = require('../lib/env')

// Required environment variables
const {
  GH_ORG,
  GITHUB_TOKEN,
  GH_TOKEN,
  LOG_LEVEL = 'info'
} = process.env

const DRY_RUN = process.env.DRY_RUN === 'true'

// Support both GITHUB_TOKEN and GH_TOKEN
const TOKEN = GITHUB_TOKEN || GH_TOKEN

// Validate required env vars
if (!GH_ORG) {
  console.error('ERROR: GH_ORG environment variable is required')
  process.exit(1)
}

if (!TOKEN) {
  console.error('ERROR: GITHUB_TOKEN or GH_TOKEN environment variable is required')
  console.error('You can use:')
  console.error('  - GitHub Personal Access Token (PAT)')
  console.error('  - GitHub App installation token')
  console.error('  - GitHub Actions GITHUB_TOKEN')
  process.exit(1)
}

// Simple logger that matches the interface expected by Settings
const logLevels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 }
const logger = {
  levels: logLevels,
  currentLevel: logLevels[LOG_LEVEL] ?? 2,

  log (level, ...args) {
    if (this.levels[level] <= this.currentLevel) {
      console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}]`, ...args)
    }
  },

  error (...args) { this.log('error', ...args) },
  warn (...args) { this.log('warn', ...args) },
  info (...args) { this.log('info', ...args) },
  debug (...args) { this.log('debug', ...args) },
  trace (...args) { this.log('trace', ...args) }
}

/**
 * Resolve the base path where config files live on the filesystem.
 * Supports GitHub Actions layout (../admin-repo/<CONFIG_PATH>) and local testing.
 */
function resolveConfigBasePath () {
  const CONFIG_PATH = env.CONFIG_PATH

  if (path.isAbsolute(CONFIG_PATH)) {
    return CONFIG_PATH
  }

  // GitHub Actions: config is checked out to ../admin-repo/
  const actionsPath = path.join(process.cwd(), '..', 'admin-repo', CONFIG_PATH)
  if (fs.existsSync(actionsPath)) {
    return actionsPath
  }

  // Local testing: relative to cwd
  return path.resolve(CONFIG_PATH)
}

/**
 * Subclass of Settings that reads configs from the local filesystem
 * and lists repos via the org API (no GitHub App required).
 */
class StandaloneSettings extends Settings {
  constructor (nop, context, repo, config, ref) {
    super(nop, context, repo, config, ref)
    this.configBasePath = resolveConfigBasePath()
    this.log.debug(`Config base path: ${this.configBasePath}`)
  }

  // --- Filesystem overrides (replace GitHub API config loading) ---

  /**
   * Load a YAML file from the local filesystem instead of GitHub API.
   * The filePath parameter mirrors what the parent class would pass to
   * octokit.repos.getContent (e.g. ".github/repos/my-repo.yml").
   */
  async loadYaml (filePath) {
    try {
      // filePath comes in as CONFIG_PATH-relative (e.g. ".github/settings.yml")
      // Strip the CONFIG_PATH prefix if present since configBasePath already includes it
      const configPrefix = env.CONFIG_PATH + '/'
      const relativePath = filePath.startsWith(configPrefix)
        ? filePath.slice(configPrefix.length)
        : filePath

      const localPath = path.join(this.configBasePath, relativePath)
      this.log.debug(`Loading YAML from filesystem: ${localPath}`)

      if (!fs.existsSync(localPath)) {
        return null
      }
      return yaml.load(fs.readFileSync(localPath, 'utf8')) || {}
    } catch (e) {
      this.log.error(`Error loading YAML file ${filePath}: ${e.message}`)
      return null
    }
  }

  /**
   * Override to list repo config files from the local filesystem
   * instead of using the GitHub Tree API.
   */
  async getRepoConfigMap () {
    const reposDir = path.join(this.configBasePath, 'repos')
    if (!fs.existsSync(reposDir)) {
      this.log.debug('No repos directory found locally')
      return []
    }

    const files = fs.readdirSync(reposDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))

    this.log.debug(`Found ${files.length} repo config files locally`)
    return files.map(f => ({
      name: f,
      path: path.posix.join(env.CONFIG_PATH, 'repos', f)
    }))
  }

  /**
   * Override to list suborg config files from the local filesystem.
   */
  async getSubOrgConfigMap () {
    const suborgsDir = path.join(this.configBasePath, 'suborgs')
    if (!fs.existsSync(suborgsDir)) {
      this.log.debug('No suborgs directory found locally')
      return []
    }

    const files = fs.readdirSync(suborgsDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))

    this.log.debug(`Found ${files.length} suborg config files locally`)
    return files.map(f => ({
      name: f,
      path: path.posix.join(env.CONFIG_PATH, 'suborgs', f)
    }))
  }

  // --- Repo listing override (use org API instead of /installation/repositories) ---

  async eachRepositoryRepos (github, log) {
    log.debug('Fetching repositories via org API (standalone mode)')
    const repos = await github.paginate(github.rest.repos.listForOrg, {
      org: GH_ORG,
      type: 'all',
      per_page: 100
    })
    log.info(`Found ${repos.length} repositories in organization`)

    return Promise.all(repos.map(repository => {
      return this.checkAndProcessRepo(repository.owner.login, repository.name)
    }))
  }

  // --- Result handling override (print to stdout instead of creating check runs) ---

  async createCheckRun () {
    // In standalone mode, skip check run creation — results are printed to stdout
    this.log.debug('Standalone mode: skipping check run creation')
  }

  async handleResults () {
    if (!this.nop) {
      // In non-nop mode, just print a summary
      if (this.errors.length > 0) {
        this.log.error(`Sync completed with ${this.errors.length} error(s):`)
        this.errors.forEach(err => {
          this.log.error(`  - [${err.repo || 'unknown'}] ${err.msg || err.error || JSON.stringify(err)}`)
        })
      }
      return
    }

    // In nop (dry-run) mode, print what would change
    const stats = { changes: 0, errors: 0 }

    this.results.forEach(res => {
      if (!res) return
      if (res.type === 'ERROR') {
        stats.errors++
        this.log.error(`Error: [${res.plugin}] ${res.repo} - ${res.action?.msg || res.action}`)
      } else if (!(res.action?.additions === null && res.action?.deletions === null && res.action?.modifications === null)) {
        stats.changes++
        const additions = res.action?.additions ? JSON.stringify(res.action.additions) : ''
        const deletions = res.action?.deletions ? JSON.stringify(res.action.deletions) : ''
        const modifications = res.action?.modifications ? JSON.stringify(res.action.modifications) : ''
        this.log.info(`[${res.plugin}] ${res.repo}:`)
        if (additions) this.log.info(`  + ${additions}`)
        if (deletions) this.log.info(`  - ${deletions}`)
        if (modifications) this.log.info(`  ~ ${modifications}`)
      }
    })

    this.log.info('\n========== DRY-RUN SUMMARY ==========')
    this.log.info(`Changes detected: ${stats.changes}`)
    this.log.info(`Errors: ${stats.errors}`)

    if (stats.errors > 0) {
      this.log.error('Dry-run completed with errors')
    } else if (stats.changes > 0) {
      this.log.info('Dry-run completed successfully — changes would be applied')
    } else {
      this.log.info('Dry-run completed — no changes needed')
    }
  }
}

// --- Main entry point ---

async function main () {
  try {
    const nop = DRY_RUN
    logger.info(`Starting standalone sync for organization: ${GH_ORG}`)
    logger.info(`Admin repo: ${env.ADMIN_REPO}`)
    logger.info(`Config path: ${env.CONFIG_PATH}/${env.SETTINGS_FILE_PATH}`)
    logger.info(`Dry run: ${nop ? 'YES' : 'NO'}`)

    // Create Octokit instance with token authentication
    const octokit = new Octokit({ auth: TOKEN })

    // Test authentication
    logger.debug('Testing authentication...')
    try {
      const { data: org } = await octokit.rest.orgs.get({ org: GH_ORG })
      logger.info(`Authenticated successfully. Organization: ${org.login}`)
    } catch (error) {
      logger.error('Authentication failed. Check your token and organization access.')
      logger.error(`Error: ${error.message}`)
      process.exit(1)
    }

    // Load deployment config from filesystem
    const configBasePath = resolveConfigBasePath()
    const deploymentConfigPath = path.join(configBasePath, env.DEPLOYMENT_CONFIG_FILE_PATH)
    let deploymentConfig = { restrictedRepos: ['admin', '.github', 'safe-settings'] }

    if (fs.existsSync(deploymentConfigPath)) {
      logger.debug(`Loading deployment config from: ${deploymentConfigPath}`)
      deploymentConfig = yaml.load(fs.readFileSync(deploymentConfigPath, 'utf8')) || deploymentConfig
    } else {
      logger.debug(`No deployment config at: ${deploymentConfigPath}, using defaults`)
    }

    // Load the main settings.yml (org-level config)
    const settingsPath = path.join(configBasePath, env.SETTINGS_FILE_PATH)
    if (!fs.existsSync(settingsPath)) {
      logger.error(`Settings file not found at: ${settingsPath}`)
      process.exit(1)
    }
    const runtimeConfig = yaml.load(fs.readFileSync(settingsPath, 'utf8')) || {}

    // Merge deployment config with runtime config (mirrors what index.js does)
    const config = Object.assign({}, deploymentConfig, runtimeConfig)

    // Build the mock context that Settings expects
    const context = {
      payload: { installation: { id: 1 } },
      octokit,
      log: logger,
      repo: () => ({ owner: GH_ORG, repo: env.ADMIN_REPO })
    }

    const repo = { owner: GH_ORG, repo: env.ADMIN_REPO }

    // Use the core Settings engine via our standalone subclass
    const settings = await StandaloneSettings.syncAll(nop, context, repo, config)

    // Exit with error if there were failures
    if (settings.errors && settings.errors.length > 0) {
      process.exit(1)
    }

    logger.info('\nStandalone sync completed successfully!')
  } catch (error) {
    logger.error('Fatal error during standalone sync:', error.message || error)
    process.exit(1)
  }
}

// Override Settings.syncAll to use our StandaloneSettings class
StandaloneSettings.syncAll = async function (nop, context, repo, config, ref) {
  const settings = new StandaloneSettings(nop, context, repo, config, ref)
  try {
    await settings.loadConfigs()
    await settings.updateOrg()
    await settings.updateAll()
    await settings.handleResults()
  } catch (error) {
    settings.logError(error.message)
    await settings.handleResults()
  }
  return settings
}

// Run the script
main()
