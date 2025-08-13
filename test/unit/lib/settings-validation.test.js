/* eslint-disable no-undef */
const Settings = require('../../../lib/settings')

jest.mock('../../../lib/env', () => ({
  VALIDATE_CONFIG_SCHEMA: true,
  CONFIG_PATH: '.github',
  SETTINGS_FILE_PATH: 'settings.yml'
}))

const context = {
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  },
  payload: {
    installation: {
      id: 123
    }
  }
}

describe('Settings Validation Tests', () => {
  it('should validate config schema when VALIDATE_CONFIG_SCHEMA is true', async () => {
    const settings = new Settings(true, context, {}, {
      repositories: {
        has_wiki: 'nonsense'
      }
    }, 'main', 'github')

    expect(settings.results).toContainEqual(expect.objectContaining({
      action: {
        msg: expect.stringContaining('has_wiki must be boolean')
      }
    }))
  })

  it('should pass valid config', async () => {
    const settings = new Settings(false, context, {}, {
      repositories: {
        has_wiki: true
      }
    }, 'main', 'github')

    expect(settings.results).toEqual([])
  })
}) // Settings Tests
