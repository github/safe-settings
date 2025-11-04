const ErrorStash = require('./errorStash')
const NopCommand = require('../nopcommand')


/**
 * Code Scanning plugin to manage GitHub Code Scanning Default Setup configuration
 * This plugin ensures that only approved languages are enabled for code scanning
 * and enforces org-level policies across all repositories.
 */
module.exports = class CodeScanning extends ErrorStash {
  constructor (nop, github, repo, settings, log, errors) {
    super(errors)
    this.github = github
    this.repo = repo
    this.settings = settings
    this.log = log
    this.nop = nop
  }

  /**
   * Main sync method that validates and enforces code scanning configuration
   */
  sync () {
    const resArray = []

    // Skip if code_scanning is not configured
    if (!this.settings || !this.settings.default_setup) {
      this.log.debug(`No code_scanning configuration found for ${this.repo.repo}`)
      return Promise.resolve([])
    }

    const { default_setup: defaultSetup } = this.settings

    // If default_setup is disabled in config, we skip management
    if (defaultSetup.enabled === false) {
      this.log.debug(`Code scanning default setup is disabled in config for ${this.repo.repo}`)
      return Promise.resolve([])
    }

    return this.getCurrentDefaultSetup()
      .then(currentConfig => {
        // If code scanning is not configured in GitHub, nothing to validate
        if (!currentConfig) {
          this.log.debug(`No code scanning default setup found in GitHub for ${this.repo.repo}`)
          if (this.nop) {
            resArray.push(
              new NopCommand(
                this.constructor.name,
                this.repo,
                null,
                'No code scanning default setup configured in repository',
                'INFO'
              )
            )
            return Promise.resolve(resArray)
          }
          return Promise.resolve([])
        }

        // Validate languages
        const validation = this.validateLanguages(currentConfig, defaultSetup)

        if (!validation.isValid) {
          this.log.warn(
            `Code scanning language validation failed for ${this.repo.repo}: ${validation.message}`
          )

          if (this.nop) {
            resArray.push(
              new NopCommand(
                this.constructor.name,
                this.repo,
                null,
                {
                  msg: 'Code scanning language validation failed',
                  current_languages: validation.currentLanguages,
                  allowed_languages: validation.allowedLanguages,
                  unauthorized_languages: validation.unauthorizedLanguages,
                  message: validation.message
                },
                'ERROR'
              )
            )
            return Promise.resolve(resArray)
          }

          // Enforce by updating to only allowed languages
          return this.enforceAllowedLanguages(currentConfig, validation, resArray)
        } else {
          this.log.debug(
            `Code scanning configuration is valid for ${this.repo.repo}: ${validation.message}`
          )
          if (this.nop) {
            resArray.push(
              new NopCommand(
                this.constructor.name,
                this.repo,
                null,
                {
                  msg: 'Code scanning configuration is valid',
                  current_languages: validation.currentLanguages,
                  allowed_languages: validation.allowedLanguages,
                  message: validation.message
                },
                'INFO'
              )
            )
            return Promise.resolve(resArray)
          }
          return Promise.resolve([])
        }
      })
      .catch(e => {
        this.logError(`Error syncing code scanning for ${this.repo.repo}: ${e.message}`)
        if (this.nop) {
          resArray.push(
            new NopCommand(
              this.constructor.name,
              this.repo,
              null,
              `Error: ${e.message}`,
              'ERROR'
            )
          )
          return Promise.resolve(resArray)
        }
        return Promise.resolve([])
      })
  }

  /**
   * Fetch the current Code Scanning Default Setup configuration from GitHub
   * @returns {Promise<Object|null>} The current configuration or null if not configured
   */
  async getCurrentDefaultSetup () {
    try {
      // GitHub API endpoint to get code scanning default setup
      // GET /repos/{owner}/{repo}/code-scanning/default-setup
      const response = await this.github.request(
        'GET /repos/{owner}/{repo}/code-scanning/default-setup',
        {
          owner: this.repo.owner,
          repo: this.repo.repo
        }
      )

      this.log.debug(
        `Retrieved code scanning default setup for ${this.repo.repo}: ${JSON.stringify(response.data)}`
      )

      return response.data
    } catch (e) {
      if (e.status === 404) {
        // Code scanning default setup is not configured
        return null
      }
      throw e
    }
  }

  /**
   * Validate that the current languages match the allowed list
   * @param {Object} currentConfig - Current GitHub configuration
   * @param {Object} desiredConfig - Desired configuration from safe-settings
   * @returns {Object} Validation result with isValid flag and details
   */
  validateLanguages (currentConfig, desiredConfig) {
    const currentLanguages = currentConfig.languages || []
    const allowedLanguages = desiredConfig.languages?.allowed || []
    const blockedLanguages = desiredConfig.languages?.blocked || []

    // Normalize to lowercase for comparison
    const normalizedCurrent = currentLanguages.map(lang => lang.toLowerCase())
    const normalizedAllowed = allowedLanguages.map(lang => lang.toLowerCase())
    const normalizedBlocked = blockedLanguages.map(lang => lang.toLowerCase())

    // Find unauthorized languages (either not in allowed list or in blocked list)
    const unauthorizedLanguages = []

    for (const lang of normalizedCurrent) {
      // If allowed list is specified and language is not in it
      if (normalizedAllowed.length > 0 && !normalizedAllowed.includes(lang)) {
        unauthorizedLanguages.push(lang)
      }
      // If language is in blocked list (but not already added above)
      else if (normalizedBlocked.includes(lang)) {
        unauthorizedLanguages.push(lang)
      }
    }

    // Remove duplicates
    const uniqueUnauthorized = [...new Set(unauthorizedLanguages)]

    const isValid = uniqueUnauthorized.length === 0

    let message = ''
    if (isValid) {
      message = 'All languages are authorized'
    } else {
      message = `Unauthorized languages detected: ${uniqueUnauthorized.join(', ')}`
      if (normalizedAllowed.length > 0) {
        message += `. Allowed: ${normalizedAllowed.join(', ')}`
      }
      if (normalizedBlocked.length > 0) {
        message += `. Blocked: ${normalizedBlocked.join(', ')}`
      }
    }

    return {
      isValid,
      currentLanguages: normalizedCurrent,
      allowedLanguages: normalizedAllowed,
      blockedLanguages: normalizedBlocked,
      unauthorizedLanguages: uniqueUnauthorized,
      message
    }
  }

  /**
   * Enforce allowed languages by updating the default setup configuration
   * @param {Object} currentConfig - Current GitHub configuration
   * @param {Object} validation - Validation result
   * @param {Array} resArray - Array to collect NopCommand results
   * @returns {Promise} Resolution of the enforcement action
   */
  async enforceAllowedLanguages (currentConfig, validation, resArray) {
    // Calculate the languages that should be enabled
    // (current languages minus unauthorized ones)
    const languagesToKeep = validation.currentLanguages.filter(
      lang => !validation.unauthorizedLanguages.includes(lang)
    )

    // If allowed list is specified, only keep languages that are in both current and allowed
    const allowedLanguages = validation.allowedLanguages
    let finalLanguages = languagesToKeep

    if (allowedLanguages.length > 0) {
      finalLanguages = languagesToKeep.filter(lang => allowedLanguages.includes(lang))
    }

    this.log.debug(
      `Enforcing code scanning languages for ${this.repo.repo}: ${finalLanguages.join(', ')}`
    )

    const updateParams = {
      owner: this.repo.owner,
      repo: this.repo.repo,
      state: currentConfig.state,
      query_suite: currentConfig.query_suite,
      languages: finalLanguages
    }

    if (this.nop) {
      resArray.push(
        new NopCommand(
          this.constructor.name,
          this.repo,
          this.github.request.endpoint(
            'PATCH /repos/{owner}/{repo}/code-scanning/default-setup',
            updateParams
          ),
          {
            msg: 'Update code scanning default setup to remove unauthorized languages',
            modifications: {
              languages: {
                before: validation.currentLanguages,
                after: finalLanguages,
                removed: validation.unauthorizedLanguages
              }
            }
          }
        )
      )
      return Promise.resolve(resArray)
    }

    // Perform the actual update
    return this.github
      .request('PATCH /repos/{owner}/{repo}/code-scanning/default-setup', updateParams)
      .then(response => {
        this.log.info(
          `Successfully updated code scanning default setup for ${this.repo.repo}`
        )
        return response
      })
      .catch(e => {
        this.logError(
          `Failed to update code scanning default setup for ${this.repo.repo}: ${e.message}`
        )
        throw e
      })
  }
}
