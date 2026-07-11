/* eslint-disable no-undef */

// Tests for the syncInstallation path in index.js, which serves scheduled
// (CRON) and full-sync runs. The app factory takes Settings as an injectable
// parameter, so the sync can be observed without touching the GitHub API.
describe('syncInstallation', () => {
  const installation = { id: 123, account: { login: 'test-org' } }
  let robot
  let settingsMock

  function buildRobot () {
    const content = Buffer.from('restrictedRepos: []').toString('base64')
    const github = {
      paginate: jest.fn().mockResolvedValue([installation]),
      rest: {
        apps: {
          listInstallations: { endpoint: { merge: jest.fn().mockReturnValue({}) } },
          getAuthenticated: jest.fn().mockResolvedValue({ data: { slug: 'safe-settings' } })
        },
        repos: {
          getContent: jest.fn().mockResolvedValue({ data: { content } })
        }
      }
    }
    return {
      log: Object.assign(jest.fn(), {
        debug: jest.fn(),
        trace: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
      }),
      auth: jest.fn().mockResolvedValue(github),
      on: jest.fn(),
      github
    }
  }

  function loadApp () {
    let app
    jest.isolateModules(() => {
      const appFn = require('../../index')
      app = appFn(robot, {}, settingsMock)
    })
    return app
  }

  beforeEach(() => {
    robot = buildRobot()
    settingsMock = {
      syncAll: jest.fn().mockResolvedValue({}),
      handleError: jest.fn().mockResolvedValue({})
    }
  })

  afterEach(() => {
    delete process.env.CONFIG_REF
  })

  describe('when CONFIG_REF is not set', () => {
    it('reads the config from the default branch and passes no ref to syncAll', async () => {
      const app = loadApp()

      await app.syncInstallation()

      expect(robot.github.rest.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: undefined }))
      expect(settingsMock.syncAll).toHaveBeenCalledTimes(1)
      expect(settingsMock.syncAll.mock.calls[0][4]).toBeUndefined()
    })
  })

  describe('when CONFIG_REF is set', () => {
    it('reads the config from that ref and passes it through to syncAll', async () => {
      process.env.CONFIG_REF = 'my-config-branch'
      const app = loadApp()

      await app.syncInstallation()

      expect(robot.github.rest.repos.getContent).toHaveBeenCalledWith(expect.objectContaining({ ref: 'my-config-branch' }))
      expect(settingsMock.syncAll).toHaveBeenCalledTimes(1)
      expect(settingsMock.syncAll.mock.calls[0][4]).toBe('my-config-branch')
    })
  })
})
