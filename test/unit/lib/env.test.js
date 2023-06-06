/* eslint-disable no-undef */
describe('env', () => {

  describe('load default values without override', () => {

    const envTest = require('../../../lib/env')

    it('loads default ADMIN_REPO if not passed', () => {
      const ADMIN_REPO = envTest.ADMIN_REPO
      expect(ADMIN_REPO).toEqual('admin')
    })

    it('loads default SETTINGS_FILE_PATH if not passed', () => {
      const SETTINGS_FILE_PATH = envTest.SETTINGS_FILE_PATH
      expect(SETTINGS_FILE_PATH).toEqual('settings.yml')
    })

    it('loads default DEPLOYMENT_CONFIG_FILE if not passed', () => {
      const SETTINGS_FILE_PATH = envTest.DEPLOYMENT_CONFIG_FILE
      expect(SETTINGS_FILE_PATH).toEqual('deployment-settings.yml')
    })

    it('loads default ENABLE_PR_COMMENT if not passed', () => {
      const ENABLE_PR_COMMENT = envTest.ENABLE_PR_COMMENT
      expect(ENABLE_PR_COMMENT).toEqual('false')
    })

  })

  describe('load override values', () => {

    beforeAll(() => {
      jest.resetModules()
      process.env.ADMIN_REPO = '.github'
      process.env.SETTINGS_FILE_PATH = 'safe-settings.yml'
      process.env.DEPLOYMENT_CONFIG_FILE = 'safe-settings-deployment.yml'
      process.env.ENABLE_PR_COMMENT = 'true'
    })

    it('loads override values if passed', () => {
      const envTest = require('../../../lib/env')
      const ADMIN_REPO = envTest.ADMIN_REPO
      expect(ADMIN_REPO).toEqual('.github')
      const SETTINGS_FILE_PATH = envTest.SETTINGS_FILE_PATH
      expect(SETTINGS_FILE_PATH).toEqual('safe-settings.yml')
      const DEPLOYMENT_CONFIG_FILE = envTest.DEPLOYMENT_CONFIG_FILE
      expect(DEPLOYMENT_CONFIG_FILE).toEqual('safe-settings-deployment.yml')
      const ENABLE_PR_COMMENT = envTest.ENABLE_PR_COMMENT
      expect(ENABLE_PR_COMMENT).toEqual('true')
    })
  })

})
