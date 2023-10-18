module.exports = {
  ADMIN_REPO: process.env.ADMIN_REPO || 'admin',
  CONFIG_PATH: '.github',
  SETTINGS_FILE_PATH: process.env.SETTINGS_FILE_PATH || 'settings.yml',
  DEPLOYMENT_CONFIG_FILE: process.env.DEPLOYMENT_CONFIG_FILE || 'deployment-settings.yml',
  CREATE_PR_COMMENT: process.env.CREATE_PR_COMMENT || 'true',
  CREATE_ERROR_ISSUE: process.env.CREATE_ERROR_ISSUE || 'true'
}
