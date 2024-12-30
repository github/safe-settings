/* eslint-disable no-undef */
describe('env', () => {
  describe('load default values without override', () => {
    const envTest = require('../../../lib/env')

    it('loads default ADMIN_REPO if not passed', () => {
      const ADMIN_REPO = envTest.ADMIN_REPO
      expect(ADMIN_REPO).toEqual('admin')
    })

    it('loads default CONFIG_PATH if not passed', () => {
      const CONFIG_PATH = envTest.CONFIG_PATH
      expect(CONFIG_PATH).toEqual('.github')
    })

    it('loads default SETTINGS_FILE_PATH if not passed', () => {
      const SETTINGS_FILE_PATH = envTest.SETTINGS_FILE_PATH
      expect(SETTINGS_FILE_PATH).toEqual('settings.yml')
    })

    it('loads default DEPLOYMENT_CONFIG_FILE if not passed', () => {
      const SETTINGS_FILE_PATH = envTest.DEPLOYMENT_CONFIG_FILE
      expect(SETTINGS_FILE_PATH).toEqual('deployment-settings.yml')
    })

    it('loads default CREATE_PR_COMMENT if not passed', () => {
      const CREATE_PR_COMMENT = envTest.CREATE_PR_COMMENT
      expect(CREATE_PR_COMMENT).toEqual('true')
    })
  })

  describe('load override values', () => {
    beforeAll(() => {
      jest.resetModules()
      process.env.ADMIN_REPO = '.github'
      process.env.CONFIG_PATH = '.config'
      process.env.SETTINGS_FILE_PATH = 'safe-settings.yml'
      process.env.DEPLOYMENT_CONFIG_FILE = 'safe-settings-deployment.yml'
      process.env.CREATE_PR_COMMENT = 'false'
    })

    it('loads override values if passed', () => {
      const envTest = require('../../../lib/env')
      const ADMIN_REPO = envTest.ADMIN_REPO
      expect(ADMIN_REPO).toEqual('.github')
      const CONFIG_PATH = envTest.CONFIG_PATH
      expect(CONFIG_PATH).toEqual('.config')
      const SETTINGS_FILE_PATH = envTest.SETTINGS_FILE_PATH
      expect(SETTINGS_FILE_PATH).toEqual('safe-settings.yml')
      const DEPLOYMENT_CONFIG_FILE = envTest.DEPLOYMENT_CONFIG_FILE
      expect(DEPLOYMENT_CONFIG_FILE).toEqual('safe-settings-deployment.yml')
      const CREATE_PR_COMMENT = envTest.CREATE_PR_COMMENT
      expect(CREATE_PR_COMMENT).toEqual('false')
    })
  })
})
