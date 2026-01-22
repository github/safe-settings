module.exports = {
  ADMIN_REPO: process.env.ADMIN_REPO || 'admin',
  CONFIG_PATH: process.env.CONFIG_PATH || '.github',
  SETTINGS_FILE_PATH: process.env.SETTINGS_FILE_PATH || 'settings.yml',
  DEPLOYMENT_CONFIG_FILE_PATH: process.env.DEPLOYMENT_CONFIG_FILE || 'deployment-settings.yml',
  CREATE_PR_COMMENT: process.env.CREATE_PR_COMMENT || 'true',
  CREATE_ERROR_ISSUE: process.env.CREATE_ERROR_ISSUE || 'true',
  BLOCK_REPO_RENAME_BY_HUMAN: process.env.BLOCK_REPO_RENAME_BY_HUMAN || 'false',
  FULL_SYNC_NOP: process.env.FULL_SYNC_NOP === 'true',
  GITHUB_ACTION_MODE: process.env.GITHUB_ACTION_MODE === 'true',
  // GitHub Actions built-in variables
  GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY || '', // format: owner/repo
  GITHUB_REF: process.env.GITHUB_REF || '' // format: refs/pull/123/merge for PRs
}
