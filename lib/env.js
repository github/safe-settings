module.exports = {
  ADMIN_REPO: process.env.ADMIN_REPO || 'admin',
  CONFIG_PATH: process.env.CONFIG_PATH || '.github',
  SETTINGS_FILE_PATH: process.env.SETTINGS_FILE_PATH || 'settings.yml',
  DEPLOYMENT_CONFIG_FILE_PATH: process.env.DEPLOYMENT_CONFIG_FILE || 'deployment-settings.yml',
  CREATE_PR_COMMENT: process.env.CREATE_PR_COMMENT || 'true',
  CREATE_ERROR_ISSUE: process.env.CREATE_ERROR_ISSUE || 'true',
  BLOCK_REPO_RENAME_BY_HUMAN: process.env.BLOCK_REPO_RENAME_BY_HUMAN || 'false',
  FULL_SYNC_NOP: process.env.FULL_SYNC_NOP === 'true',
  // If set to 'true', then when a team is referenced in a repo settings file but does not
  // exist in the org, safe-settings will create it. Default 'false' (TomTom: teams are
  // managed by a separate Terraform pipeline in tomtom-internal/admin).
  FEATURE_CREATE_TEAMS_IF_NOT_EXIST: process.env.FEATURE_CREATE_TEAMS_IF_NOT_EXIST || 'false'
}
