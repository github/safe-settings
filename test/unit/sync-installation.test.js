/* eslint-disable no-undef */
const path = require('path')

// The plugin reads GH_ORG through lib/env, which snapshots process.env at
// require time, so each scenario needs a freshly required copy of both.
function loadPlugin (ghOrg) {
  jest.resetModules()
  if (ghOrg === undefined) {
    delete process.env.GH_ORG
  } else {
    process.env.GH_ORG = ghOrg
  }
  return require('../../index')
}

function installation (id, login) {
  return { id, account: { login } }
}

describe('syncInstallation', () => {
  const originalGhOrg = process.env.GH_ORG
  const originalDeploymentConfigFile = process.env.DEPLOYMENT_CONFIG_FILE
  let robot, octokit, syncAll

  beforeAll(() => {
    // Point the deployment config at a file that does not exist so
    // loadYamlFileSystem() falls back to its built-in defaults instead of
    // picking up whatever happens to sit in the working directory.
    process.env.DEPLOYMENT_CONFIG_FILE = path.join(__dirname, 'no-such-deployment-settings.yml')
  })

  afterAll(() => {
    if (originalGhOrg === undefined) {
      delete process.env.GH_ORG
    } else {
      process.env.GH_ORG = originalGhOrg
    }
    if (originalDeploymentConfigFile === undefined) {
      delete process.env.DEPLOYMENT_CONFIG_FILE
    } else {
      process.env.DEPLOYMENT_CONFIG_FILE = originalDeploymentConfigFile
    }
  })

  beforeEach(() => {
    octokit = {
      paginate: jest.fn(),
      rest: {
        apps: {
          listInstallations: { endpoint: { merge: jest.fn(options => options) } },
          getAuthenticated: jest.fn().mockResolvedValue({ data: { slug: 'safe-settings' } })
        },
        repos: {
          // The global settings file is irrelevant here: these tests assert
          // which installation is selected, not what gets synced.
          getContent: jest.fn().mockResolvedValue({ data: { content: '' } })
        }
      }
    }
    robot = {
      auth: jest.fn().mockResolvedValue(octokit),
      log: Object.assign(jest.fn(), {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn()
      }),
      on: jest.fn()
    }
    syncAll = jest.fn().mockResolvedValue({ errors: [] })
  })

  // Returns the `repo` argument Settings.syncAll was called with, i.e. the
  // admin repo of the account safe-settings decided to sync.
  function syncedRepo () {
    expect(syncAll).toHaveBeenCalledTimes(1)
    return syncAll.mock.calls[0][2]
  }

  it('syncs the installation matching GH_ORG, not the first one listed', async () => {
    const plugin = loadPlugin('my-org')
    octokit.paginate.mockResolvedValue([
      installation(1, 'another-account'),
      installation(2, 'my-org')
    ])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })
    await app.syncInstallation()

    expect(syncedRepo()).toEqual({ owner: 'my-org', repo: 'admin' })
    // The context handed to syncAll must be authenticated as the GH_ORG
    // installation. (info() separately authenticates as installations[0] to
    // read the app slug; that is left as-is, see the PR description.)
    expect(robot.auth).toHaveBeenLastCalledWith(2)
  })

  it('matches GH_ORG case-insensitively, as GitHub account names are', async () => {
    const plugin = loadPlugin('My-Org')
    octokit.paginate.mockResolvedValue([
      installation(1, 'another-account'),
      installation(7, 'my-org')
    ])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })
    await app.syncInstallation()

    expect(syncedRepo()).toEqual({ owner: 'my-org', repo: 'admin' })
  })

  it('throws when GH_ORG has no installation instead of syncing another account', async () => {
    const plugin = loadPlugin('my-org')
    octokit.paginate.mockResolvedValue([
      installation(1, 'another-account'),
      installation(2, 'yet-another-account')
    ])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })

    await expect(app.syncInstallation()).rejects.toThrow(
      "No app installation found for GH_ORG 'my-org'. Installed on: [another-account, yet-another-account]"
    )
    expect(syncAll).not.toHaveBeenCalled()
  })

  it('falls back to the first installation when GH_ORG is not set', async () => {
    const plugin = loadPlugin(undefined)
    octokit.paginate.mockResolvedValue([
      installation(1, 'first-account'),
      installation(2, 'second-account')
    ])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })
    await app.syncInstallation()

    expect(syncedRepo()).toEqual({ owner: 'first-account', repo: 'admin' })
  })

  it('returns null without syncing when the app has no installations', async () => {
    const plugin = loadPlugin(undefined)
    octokit.paginate.mockResolvedValue([])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })

    await expect(app.syncInstallation()).resolves.toBeNull()
    expect(syncAll).not.toHaveBeenCalled()
  })

  it('passes the nop flag through to the sync', async () => {
    const plugin = loadPlugin('my-org')
    octokit.paginate.mockResolvedValue([installation(2, 'my-org')])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })
    await app.syncInstallation(true)

    expect(syncAll).toHaveBeenCalledWith(true, expect.anything(), expect.anything(), expect.anything())
  })

  it('logs which account is being synced', async () => {
    const plugin = loadPlugin('my-org')
    octokit.paginate.mockResolvedValue([
      installation(1, 'another-account'),
      installation(2, 'my-org')
    ])

    const app = plugin(robot, {}, { syncAll, handleError: jest.fn() })
    await app.syncInstallation()

    expect(robot.log.info).toHaveBeenCalledWith('Syncing installation 2 on account my-org')
  })
})
