module.exports = {
  ADMIN_ORG: process.env.SAFE_SETTINGS_ADMIN_ORG || 'admin',
  ADMIN_REPO: process.env.SAFE_SETTINGS_ADMIN_REPO || 'admin',
  CONFIG_PATH: process.env.SAFE_SETTINGS_CONFIG_PATH || '.github',
  SETTINGS_FILE_PATH: process.env.SAFE_SETTINGS_SETTINGS_FILE_PATH || 'settings.yml'
}
