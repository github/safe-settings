/* eslint-disable no-undef */

describe('syncInstallation GH_ORG filtering', () => {
  let robot, mockAuthGithub, installations

  const orgInstallation = { id: 100, account: { login: 'my-org' } }
  const otherInstallation = { id: 200, account: { login: 'other-org' } }

  beforeEach(() => {
    jest.resetModules()
    delete process.env.GH_ORG

    mockAuthGithub = {
      rest: {
        repos: {
          getContent: jest.fn().mockResolvedValue({ data: { content: Buffer.from('{}').toString('base64') } })
        },
        apps: {
          getAuthenticated: jest.fn().mockResolvedValue({ data: { slug: 'safe-settings' } })
        }
      },
      paginate: jest.fn().mockResolvedValue([])
    }

    installations = [otherInstallation, orgInstallation]

    const mockUnauthGithub = {
      paginate: jest.fn().mockResolvedValue(installations),
      rest: {
        apps: {
          listInstallations: {
            endpoint: {
              merge: jest.fn().mockReturnValue({})
            }
          }
        }
      }
    }

    robot = {
      // Every unauthenticated call (no args) returns mockUnauthGithub,
      // every authenticated call (with installation id) returns mockAuthGithub
      auth: jest.fn((id) => {
        if (id === undefined) return Promise.resolve(mockUnauthGithub)
        return Promise.resolve(mockAuthGithub)
      }),
      on: jest.fn(),
      log: {
        info: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
        error: jest.fn(),
        warn: jest.fn()
      }
    }
  })

  afterEach(() => {
    delete process.env.GH_ORG
  })

  function loadPlugin () {
    const Settings = {
      FILE_PATH: '.github/settings.yml',
      syncAll: jest.fn().mockResolvedValue({ errors: [] }),
      handleError: jest.fn()
    }
    const plugin = require('../../../index')
    const app = plugin(robot, { getRouter: jest.fn() }, Settings)
    return { app, Settings }
  }

  it('selects the installation matching GH_ORG when set', async () => {
    process.env.GH_ORG = 'my-org'
    const { app } = loadPlugin()

    await app.syncInstallation(false)

    expect(robot.auth).toHaveBeenCalledWith(orgInstallation.id)
  })

  it('falls back to first installation when GH_ORG is not set', async () => {
    delete process.env.GH_ORG
    const { app } = loadPlugin()

    await app.syncInstallation(false)

    expect(robot.auth).toHaveBeenCalledWith(otherInstallation.id)
  })

  it('falls back to first installation when GH_ORG does not match any', async () => {
    process.env.GH_ORG = 'nonexistent-org'
    const { app } = loadPlugin()

    await app.syncInstallation(false)

    expect(robot.auth).toHaveBeenCalledWith(otherInstallation.id)
  })

  it('uses the correct owner in the context when GH_ORG matches', async () => {
    process.env.GH_ORG = 'my-org'
    const { app, Settings } = loadPlugin()

    await app.syncInstallation(false)

    const syncAllCall = Settings.syncAll.mock.calls[0]
    const context = syncAllCall[1]
    expect(context.repo().owner).toEqual('my-org')
  })

  it('uses first installation owner when GH_ORG is not set', async () => {
    delete process.env.GH_ORG
    const { app, Settings } = loadPlugin()

    await app.syncInstallation(false)

    const syncAllCall = Settings.syncAll.mock.calls[0]
    const context = syncAllCall[1]
    expect(context.repo().owner).toEqual('other-org')
  })
})
