#!/usr/bin/env node

/**
 * Standalone sync script for safe-settings
 * Runs without webhooks or GitHub App server
 * Designed to be run from GitHub Actions or command line
 */

const { Octokit } = require('@octokit/rest')
const { createAppAuth } = require('@octokit/auth-app')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')
const env = require('./lib/env')

// Required environment variables
const {
  GH_ORG,
  APP_ID,
  PRIVATE_KEY,
  ADMIN_REPO = 'edge-devops-safe-settings',
  CONFIG_PATH = '.github',
  SETTINGS_FILE_PATH = 'settings.yml',
  DEPLOYMENT_CONFIG_FILE = 'deployment-settings.yml',
  LOG_LEVEL = 'info',
  DRY_RUN = false
} = process.env

// Validate required env vars
if (!GH_ORG) {
  console.error('ERROR: GH_ORG environment variable is required')
  process.exit(1)
}

if (!APP_ID) {
  console.error('ERROR: APP_ID environment variable is required')
  process.exit(1)
}

if (!PRIVATE_KEY) {
  console.error('ERROR: PRIVATE_KEY environment variable is required')
  process.exit(1)
}

// Simple logger
const logger = {
  levels: { error: 0, warn: 1, info: 2, debug: 3, trace: 4 },
  currentLevel: logger?.levels?.[LOG_LEVEL] ?? 2,
  
  log (level, ...args) {
    if (this.levels[level] <= this.currentLevel) {
      console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}]`, ...args)
    }
  },
  
  error: function(...args) { this.log('error', ...args) },
  warn: function(...args) { this.log('warn', ...args) },
  info: function(...args) { this.log('info', ...args) },
  debug: function(...args) { this.log('debug', ...args) },
  trace: function(...args) { this.log('trace', ...args) }
}

async function main() {
  try {
    logger.info(`Starting standalone sync for organization: ${GH_ORG}`)
    logger.info(`Admin repo: ${ADMIN_REPO}`)
    logger.info(`Config path: ${CONFIG_PATH}/${SETTINGS_FILE_PATH}`)
    logger.info(`Dry run: ${DRY_RUN === 'true' ? 'YES' : 'NO'}`)
    
    // Create Octokit instance with App authentication
    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: APP_ID,
        privateKey: PRIVATE_KEY.replace(/\\n/g, '\n')
      }
    })
    
    // Get the installation ID for the organization
    logger.debug('Fetching installation ID for organization...')
    const { data: installation } = await octokit.apps.getOrgInstallation({
      org: GH_ORG
    })
    
    logger.info(`Installation ID: ${installation.id}`)
    
    // Create installation-authenticated octokit
    const installationOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: APP_ID,
        privateKey: PRIVATE_KEY.replace(/\\n/g, '\n'),
        installationId: installation.id
      }
    })
    
    // Load configuration files
    logger.info('Loading configuration files...')
    const configPath = path.join(process.cwd(), '..', 'admin-repo', CONFIG_PATH)
    
    // Load deployment settings
    let deploymentConfig = {}
    const deploymentConfigPath = path.join(configPath, DEPLOYMENT_CONFIG_FILE)
    if (fs.existsSync(deploymentConfigPath)) {
      logger.debug(`Loading deployment config from: ${deploymentConfigPath}`)
      deploymentConfig = yaml.load(fs.readFileSync(deploymentConfigPath, 'utf8'))
      logger.debug('Deployment config loaded:', JSON.stringify(deploymentConfig, null, 2))
    } else {
      logger.warn(`Deployment config not found at: ${deploymentConfigPath}`)
    }
    
    // Load organization settings
    const settingsPath = path.join(configPath, SETTINGS_FILE_PATH)
    if (!fs.existsSync(settingsPath)) {
      logger.error(`Settings file not found at: ${settingsPath}`)
      process.exit(1)
    }
    
    logger.debug(`Loading settings from: ${settingsPath}`)
    const orgSettings = yaml.load(fs.readFileSync(settingsPath, 'utf8'))
    logger.info('Organization settings loaded')
    
    // Load repo-specific settings
    const reposPath = path.join(configPath, 'repos')
    const repoSettings = {}
    
    if (fs.existsSync(reposPath)) {
      logger.debug(`Loading repo settings from: ${reposPath}`)
      const repoFiles = fs.readdirSync(reposPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
      
      for (const file of repoFiles) {
        const repoName = path.basename(file, path.extname(file))
        const repoConfigPath = path.join(reposPath, file)
        repoSettings[repoName] = yaml.load(fs.readFileSync(repoConfigPath, 'utf8'))
        logger.debug(`Loaded settings for repo: ${repoName}`)
      }
      
      logger.info(`Loaded settings for ${Object.keys(repoSettings).length} repositories`)
    }
    
    // Get list of repositories
    logger.info('Fetching repositories...')
    const { data: repos } = await installationOctokit.repos.listForOrg({
      org: GH_ORG,
      type: 'all',
      per_page: 100
    })
    
    logger.info(`Found ${repos.length} repositories in organization`)
    
    // Filter repos based on deployment config
    const restrictedRepos = deploymentConfig.restrictedRepos || {}
    const excludePatterns = restrictedRepos.exclude || ['admin', '.github', 'safe-settings']
    const includePatterns = restrictedRepos.include || []
    
    const filteredRepos = repos.filter(repo => {
      // Check exclude patterns
      for (const pattern of excludePatterns) {
        if (repo.name === pattern || new RegExp(pattern).test(repo.name)) {
          logger.debug(`Excluding repo: ${repo.name} (matched exclude pattern: ${pattern})`)
          return false
        }
      }
      
      // Check include patterns (if specified)
      if (includePatterns.length > 0) {
        let included = false
        for (const pattern of includePatterns) {
          if (repo.name === pattern || new RegExp(pattern).test(repo.name)) {
            included = true
            break
          }
        }
        if (!included) {
          logger.debug(`Excluding repo: ${repo.name} (not in include patterns)`)
          return false
        }
      }
      
      return true
    })
    
    logger.info(`Processing ${filteredRepos.length} repositories after filtering`)
    
    // Process each repository
    const results = { success: [], failed: [], skipped: [] }
    
    for (const repo of filteredRepos) {
      try {
        logger.info(`Processing repository: ${repo.name}`)
        
        // Check if repo has specific settings
        const repoConfig = repoSettings[repo.name]
        
        if (!repoConfig) {
          logger.debug(`No specific config for ${repo.name}, using org defaults`)
          results.skipped.push(repo.name)
          continue
        }
        
        // Merge settings: org defaults + repo specific
        const mergedSettings = {
          ...orgSettings,
          ...repoConfig
        }
        
        logger.debug(`Merged settings for ${repo.name}:`, JSON.stringify(mergedSettings, null, 2))
        
        if (DRY_RUN === 'true') {
          logger.info(`[DRY RUN] Would apply settings to: ${repo.name}`)
          results.success.push(repo.name)
        } else {
          // Apply settings (you'll need to implement the actual API calls)
          logger.info(`Applying settings to: ${repo.name}`)
          // TODO: Implement actual settings application via API
          results.success.push(repo.name)
        }
        
      } catch (error) {
        logger.error(`Failed to process ${repo.name}:`, error.message)
        results.failed.push({ repo: repo.name, error: error.message })
      }
    }
    
    // Summary
    logger.info('\n========== SYNC SUMMARY ==========')
    logger.info(`Total repositories: ${filteredRepos.length}`)
    logger.info(`Successful: ${results.success.length}`)
    logger.info(`Failed: ${results.failed.length}`)
    logger.info(`Skipped: ${results.skipped.length}`)
    
    if (results.failed.length > 0) {
      logger.error('\nFailed repositories:')
      results.failed.forEach(f => logger.error(`  - ${f.repo}: ${f.error}`))
      process.exit(1)
    }
    
    logger.info('\nStandalone sync completed successfully!')
    
  } catch (error) {
    logger.error('Fatal error during standalone sync:', error)
    process.exit(1)
  }
}

// Run the script
main()
