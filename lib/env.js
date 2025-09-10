module.exports = {
  ADMIN_REPO: process.env.ADMIN_REPO || 'admin',
  SAFE_SETTINGS_HUB_REPO: process.env.SAFE_SETTINGS_HUB_REPO || 'admin-master',
  SAFE_SETTINGS_HUB_ORG: process.env.SAFE_SETTINGS_HUB_ORG || 'admin-master-org',
  SAFE_SETTINGS_HUB_DIRECT_PUSH: process.env.SAFE_SETTINGS_HUB_DIRECT_PUSH || 'false',
  SAFE_SETTINGS_HUB_PATH: process.env.SAFE_SETTINGS_HUB_PATH || '.github/safe-settings',
  APP_ID: process.env.APP_ID || null,
  PRIVATE_KEY_PATH: process.env.PRIVATE_KEY_PATH || 'private-key.pem',
  CONFIG_PATH: process.env.CONFIG_PATH || '.github',
  SETTINGS_FILE_PATH: process.env.SETTINGS_FILE_PATH || 'settings.yml',
  DEPLOYMENT_CONFIG_FILE_PATH: process.env.DEPLOYMENT_CONFIG_FILE || 'deployment-settings.yml',
  CREATE_PR_COMMENT: process.env.CREATE_PR_COMMENT || 'true',
  CREATE_ERROR_ISSUE: process.env.CREATE_ERROR_ISSUE || 'true',
  BLOCK_REPO_RENAME_BY_HUMAN: process.env.BLOCK_REPO_RENAME_BY_HUMAN || 'false',
  FULL_SYNC_NOP: process.env.FULL_SYNC_NOP === 'true'
}
