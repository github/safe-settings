module.exports = {
  ADMIN_REPO: process.env.ADMIN_REPO || 'admin',
  CONFIG_PATH: '.github',
  SETTINGS_FILE_PATH: process.env.SETTINGS_FILE_PATH || 'settings.yml',
  DEPLOYMENT_CONFIG_FILE: process.env.DEPLOYMENT_CONFIG_FILE || 'deployment-settings.yml',
  ENABLE_PR_COMMENT: process.env.ENABLE_PR_COMMENT || 'false'
}
