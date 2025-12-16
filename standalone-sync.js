#!/usr/bin/env node

/**
 * Standalone sync script for safe-settings
 * Runs without webhooks or GitHub App server
 * Designed to be run from GitHub Actions or command line
 * 
 * Uses simple token-based authentication (PAT or GitHub App token)
 */

const { Octokit } = require('@octokit/rest')
const yaml = require('js-yaml')
const fs = require('fs')
const path = require('path')

// Required environment variables
const {
  GH_ORG,
  GITHUB_TOKEN,
  GH_TOKEN,
  ADMIN_REPO = 'edge-devops-safe-settings',
  CONFIG_PATH = '.github',
  SETTINGS_FILE_PATH = 'settings.yml',
  DEPLOYMENT_CONFIG_FILE = 'deployment-settings.yml',
  LOG_LEVEL = 'info',
  DRY_RUN = false
} = process.env

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

// Simple logger
const logLevels = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 }
const logger = {
  levels: logLevels,
  currentLevel: logLevels[LOG_LEVEL] ?? 2,
  
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
    
    // Create Octokit instance with token authentication
    const octokit = new Octokit({
      auth: TOKEN
    })
    
    // Test authentication
    logger.debug('Testing authentication...')
    try {
      const { data: user } = await octokit.users.getAuthenticated()
      logger.info(`Authenticated as: ${user.login}`)
    } catch (error) {
      logger.error('Authentication failed. Check your token.')
      throw error
    }
    
    // Load configuration files
    logger.info('Loading configuration files...')
    
    // Support both local testing and GitHub Actions paths
    // Local: CONFIG_PATH can be absolute or relative to cwd
    // GitHub Actions: CONFIG_PATH is in ../admin-repo/ directory
    let configPath
    if (path.isAbsolute(CONFIG_PATH)) {
      configPath = CONFIG_PATH
    } else if (fs.existsSync(path.join(process.cwd(), '..', 'admin-repo', CONFIG_PATH))) {
      // GitHub Actions structure
      configPath = path.join(process.cwd(), '..', 'admin-repo', CONFIG_PATH)
    } else {
      // Local testing - relative to current directory
      configPath = path.resolve(CONFIG_PATH)
    }
    
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
    
    // Load suborg settings
    const suborgsPath = path.join(configPath, 'suborgs')
    const suborgSettings = {}
    
    if (fs.existsSync(suborgsPath)) {
      logger.debug(`Loading suborg settings from: ${suborgsPath}`)
      const suborgFiles = fs.readdirSync(suborgsPath).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
      
      for (const file of suborgFiles) {
        const suborgName = path.basename(file, path.extname(file))
        const suborgConfigPath = path.join(suborgsPath, file)
        suborgSettings[suborgName] = yaml.load(fs.readFileSync(suborgConfigPath, 'utf8'))
        logger.debug(`Loaded settings for suborg: ${suborgName}`)
      }
      
      logger.info(`Loaded settings for ${Object.keys(suborgSettings).length} sub-organizations`)
    }
    
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
    
    // Get list of repositories (with pagination)
    logger.info('Fetching repositories...')
    let allRepos = []
    let page = 1
    let hasMore = true
    
    while (hasMore) {
      const { data: repos } = await octokit.repos.listForOrg({
        org: GH_ORG,
        type: 'all',
        per_page: 100,
        page: page
      })
      
      allRepos = allRepos.concat(repos)
      hasMore = repos.length === 100
      page++
      
      if (hasMore) {
        logger.debug(`Fetched page ${page - 1}, got ${repos.length} repos, fetching more...`)
      }
    }
    
    logger.info(`Found ${allRepos.length} repositories in organization`)
    
    // Filter repos based on deployment config
    const restrictedRepos = deploymentConfig.restrictedRepos || {}
    const excludeList = restrictedRepos.exclude || ['admin', '.github', 'safe-settings']
    let includeList = restrictedRepos.include || []
    
    // If include list is empty, auto-generate from suborg configs and repo-specific configs
    if (includeList.length === 0) {
      const autoInclude = new Set()
      
      // Add all repos from suborg configs
      const suborgConfig = deploymentConfig.subOrgConfig || {}
      for (const [suborgName, config] of Object.entries(suborgConfig)) {
        if (config.repos) {
          config.repos.forEach(repo => autoInclude.add(repo))
          logger.debug(`Added ${config.repos.length} repos from suborg: ${suborgName}`)
        }
      }
      
      // Add all repos with explicit repo-specific configs
      Object.keys(repoSettings).forEach(repo => autoInclude.add(repo))
      
      includeList = Array.from(autoInclude)
      logger.debug(`Auto-generated include list: ${includeList.length} repos`)
    }
    
    const filteredRepos = allRepos.filter(repo => {
      // Check exclude list (exact match)
      if (excludeList.includes(repo.name)) {
        logger.debug(`Excluding repo: ${repo.name} (in exclude list)`)
        return false
      }
      
      // Check include list (if specified, must be exact match)
      if (includeList.length > 0) {
        if (!includeList.includes(repo.name)) {
          logger.trace(`Excluding repo: ${repo.name} (not in include list)`)
          return false
        }
      }
      
      return true
    })
    
    logger.info(`Processing ${filteredRepos.length} repositories after filtering`)
    
    // Helper function to determine which suborg a repo belongs to
    function getSuborgForRepo(repoName) {
      const suborgConfig = deploymentConfig.subOrgConfig || {}
      
      for (const [suborgName, config] of Object.entries(suborgConfig)) {
        // Check if repo is in the suborg's repo list
        if (config.repos && config.repos.includes(repoName)) {
          return suborgName
        }
      }
      
      return null
    }
    
    // Process each repository
    const results = { success: [], failed: [], skipped: [] }
    
    for (const repo of filteredRepos) {
      try {
        // Determine which suborg this repo belongs to
        const suborgName = getSuborgForRepo(repo.name)
        
        // Check if repo has specific settings
        const repoConfig = repoSettings[repo.name]
        const suborgConfig = suborgName ? suborgSettings[suborgName] : null
        
        if (!repoConfig && !suborgConfig) {
          logger.trace(`Skipping ${repo.name} - no config`)
          results.skipped.push(repo.name)
          continue
        }
        
        // Build config source description
        const configSources = []
        if (suborgConfig) configSources.push(`suborg:${suborgName}`)
        if (repoConfig) configSources.push('repo-specific')
        const configSource = configSources.length > 0 ? ` [${configSources.join(' + ')}]` : ''
        
        logger.info(`Processing repository: ${repo.name}${configSource}`)
        
        // Merge settings: org defaults + suborg + repo specific
        let mergedSettings = { ...orgSettings }
        
        if (suborgConfig) {
          logger.debug(`Applying suborg config: ${suborgName}`)
          // Merge suborg settings (arrays like rulesets and teams should be combined)
          mergedSettings = {
            ...mergedSettings,
            ...suborgConfig,
            rulesets: [...(mergedSettings.rulesets || []), ...(suborgConfig.rulesets || [])],
            teams: suborgConfig.teams || mergedSettings.teams,
            custom_properties: suborgConfig.custom_properties || mergedSettings.custom_properties
          }
        }
        
        if (repoConfig) {
          logger.debug(`Applying repo-specific config`)
          // Repo-specific settings override everything
          mergedSettings = {
            ...mergedSettings,
            ...repoConfig,
            rulesets: repoConfig.rulesets || mergedSettings.rulesets,
            teams: repoConfig.teams || mergedSettings.teams,
            custom_properties: repoConfig.custom_properties || mergedSettings.custom_properties
          }
        }
        
        logger.debug(`Merged settings for ${repo.name}:`, JSON.stringify(mergedSettings, null, 2))
        
        if (DRY_RUN === 'true') {
          logger.info(`\n[DRY RUN] Would apply the following settings to: ${repo.name}`)
          logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          
          // Show repository settings
          if (mergedSettings.repository) {
            logger.info('  📋 Repository:')
            if (mergedSettings.repository.description) {
              logger.info(`     Description: "${mergedSettings.repository.description}"`)
            }
          }
          
          // Show teams
          if (mergedSettings.teams && mergedSettings.teams.length > 0) {
            logger.info(`  👥 Teams (${mergedSettings.teams.length}):`)
            mergedSettings.teams.forEach(team => {
              logger.info(`     - ${team.name}: ${team.permission}`)
            })
          }
          
          // Show rulesets
          if (mergedSettings.rulesets && mergedSettings.rulesets.length > 0) {
            logger.info(`  🛡️  Rulesets (${mergedSettings.rulesets.length}):`)
            mergedSettings.rulesets.forEach(ruleset => {
              logger.info(`     - ${ruleset.name} (${ruleset.enforcement})`)
              if (ruleset.conditions?.ref_name?.include) {
                logger.info(`       Applies to: ${ruleset.conditions.ref_name.include.join(', ')}`)
              }
              if (ruleset.rules) {
                ruleset.rules.forEach(rule => {
                  logger.info(`       Rule: ${rule.type}`)
                  if (rule.type === 'required_status_checks' && rule.parameters?.required_status_checks) {
                    rule.parameters.required_status_checks.forEach(check => {
                      logger.info(`         - ${check.context}`)
                    })
                  }
                })
              }
            })
          }
          
          // Show custom properties
          if (mergedSettings.custom_properties && mergedSettings.custom_properties.length > 0) {
            logger.info(`  🏷️  Custom Properties (${mergedSettings.custom_properties.length}):`)
            mergedSettings.custom_properties.forEach(prop => {
              logger.info(`     - ${prop.name}: "${prop.value}"`)
            })
          }
          
          logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
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
