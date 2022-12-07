/* eslint-disable no-undef */
describe('env', () => {

  describe('load default values without override', () => {

    const envTest = require('../../../lib/env')

    it('loads default CONFIG_PATH if not passed', () => {
      const CONFIG_PATH = envTest.CONFIG_PATH
      expect(CONFIG_PATH).toEqual('.github')
    })

    it('loads default SETTINGS_FILE_PATH if not passed', () => {
      const SETTINGS_FILE_PATH = envTest.SETTINGS_FILE_PATH
      expect(SETTINGS_FILE_PATH).toEqual('settings.yml')
    })

    it('loads default ADMIN_ORG if not passed', () => {
      const ADMIN_ORG = envTest.ADMIN_ORG
      expect(ADMIN_ORG).toEqual('admin')
    })

    it('loads default ADMIN_REPO if not passed', () => {
      const ADMIN_REPO = envTest.ADMIN_REPO
      expect(ADMIN_REPO).toEqual('admin')
    })
  })

  describe('load override values', () => {

    beforeAll(() => {
      jest.resetModules()
      process.env.ADMIN_ORG = '.github'
      process.env.ADMIN_REPO = '.github'
    })

    it('loads override values if passed', () => {
      const envTest = require('../../../lib/env')
      const ADMIN_ORG = envTest.ADMIN_ORG
      expect(ADMIN_ORG).toEqual('.github')
      const ADMIN_REPO = envTest.ADMIN_REPO
      expect(ADMIN_REPO).toEqual('.github')
    })
  })

})
