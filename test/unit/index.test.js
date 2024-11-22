const { Probot } = require('probot')
const { getLog } = require('probot/lib/helpers/get-log')
const plugin = require('../../index')
const env = require('../../lib/env')
const fs = require('fs')
const path = require('path')
/** @import { Probot, ProbotOctokit } from "probot" */

function getFixture (...paths) {
  const pathToFixtures = path.resolve(__dirname, '..', 'fixtures', ...paths)
  return fs.readFileSync(pathToFixtures, 'utf-8')
}
function getApiResponse (filename) {
  const pathToFixtures = path.resolve(__dirname, '..', 'fixtures', 'api_responses', filename)
  return { data: JSON.parse(fs.readFileSync(pathToFixtures, 'utf-8')) }
}

describe('webhooks', () => {
  /** @type {Probot} */
  let app
  let event
  /** @type {InstanceType<typeof ProbotOctokit>} */
  let github

  beforeEach(async () => {
    /** @type {InstanceType<typeof ProbotOctokit>} */
    class Octokit {
      static defaults () {
        return Octokit
      }

      constructor () {
        this.config = {
          get: jest.fn().mockReturnValue({})
        }
        this.paginate = jest.fn()
          .mockImplementation(async (params) => {
            if (params === 'GET /installation/repositories') {
              return [{ owner: { login: 'bkeepers-inc' }, name: 'botland' }]
            } else if (params && params.route === 'GET /orgs/{org}/rulesets') {
              return [{ id: 21 }]
            } else if (params && params.route === 'GET /orgs/{org}/rulesets/{id}') {
              return []
            } else if (params && params.route === 'GET /orgs/{org}/installations') {
              return [{ id: 21 }]
            } else {
              console.log({ params })
              throw new Error('not implemented')
            }
          })
        this.repos = {
          getContents: jest.fn().mockImplementation(() => Promise.resolve({ data: { content: '' } })),
          getContent: jest.fn().mockImplementation((params) => {
            if (params && params.path === '.github/settings.yml') {
              return Promise.resolve({ data: { content: btoa(getFixture('settings.yml')) } })
            } else if (params && params.path === '.github') {
              return Promise.resolve({ data: [{ name: 'repos', path: '.github/repos', sha: '2a97853ea484cd71a00e2cfe0dac45067b05b3e4' }] })
            } else if (params && params.path === '.github/suborgs') {
              return Promise.resolve({ data: [] }) // Should return a list of files in that folder. GitHub would return 404 on an empty (non-existing) folder, but this works for testing purposes
            } else {
              return Promise.resolve({ data: { content: '' } }) // Usually we don't need any return value when this is called while testing
            }
          }),
          get: jest.fn().mockResolvedValue(getApiResponse('get_repository.json')),
          listCommits: jest.fn().mockResolvedValue({ data: { commits: { data: [{ sha: 'bb8a050117521bc7a01c2f691d5709da0510a387' }] } } }),
          getBranch: jest.fn().mockResolvedValue({ data: { name: 'main' } }),
          update: jest.fn().mockImplementation(() => null)
        }
        this.git = {
          getTree: jest.fn().mockResolvedValue({ data: { tree: [{ path: 'botland.yml' }] } })
        }
        this.request = Object.assign(
          async function (route, parameters) {
            if (route === 'POST /orgs/{org}/rulesets') {
              return { url: 'mock call' }
            } else {
              console.log({ route, parameters })
              throw new Error('not implemented')
            }
          },
          {
            endpoint: { merge: jest.fn().mockImplementation((route, options) => ({ route, options })) }
          }
        )
        this.apps = {
          listInstallations: {
            endpoint: { merge: jest.fn().mockImplementation(() => ({ route: 'GET /orgs/{org}/installations' })) }
          },
          getAuthenticated: jest.fn().mockResolvedValue({ data: { slug: 'octoapp' } })
        }
      }

      auth () {
        return this
      }
    }

    app = new Probot({ secret: 'abcdef', Octokit, log: getLog({ level: 'info' }) })
    github = await app.auth()
    event = {
      name: 'push',
      payload: JSON.parse(JSON.stringify(require('../fixtures/events/push.settings.json')))
    }
    env.ADMIN_REPO = 'botland'

    plugin(app, {})
  })

  describe('with settings modified on master', () => {
    it('syncs settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

  describe('on another branch', () => {
    beforeEach(() => {
      event.payload.ref = 'refs/heads/other-branch'
    })

    it('does not sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).not.toHaveBeenCalled()
    })
  })

  describe('with other files modified', () => {
    beforeEach(() => {
      event.payload = require('../fixtures/events/push.readme.json')
    })

    it('does not sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).not.toHaveBeenCalled()
    })
  })

  describe('default branch changed', () => {
    beforeEach(() => {
      event = {
        name: 'repository.edited',
        payload: require('../fixtures/events/repository.edited.json')
      }
    })

    it('does sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

  describe('member event', () => {
    beforeEach(() => {
      event = {
        name: 'member',
        payload: require('../fixtures/events/member.json')
      }
    })

    it('does sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

  describe('team added to repository', () => {
    beforeEach(() => {
      event = {
        name: 'team.added_to_repository',
        payload: require('../fixtures/events/team.added_to_repository.json')
      }
    })

    it('does sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

  describe('team removed from repository', () => {
    beforeEach(() => {
      event = {
        name: 'team.removed_from_repository',
        payload: require('../fixtures/events/team.removed_from_repository.json')
      }
    })

    it('does sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

  describe('team access changed', () => {
    beforeEach(() => {
      event = {
        name: 'team.edited',
        payload: require('../fixtures/events/team.edited.json')
      }
    })

    it('does sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

  describe('repository created', () => {
    event = {
      name: 'repository.created',
      payload: {}
    }

    it('does sync settings', async () => {
      await app.receive(event)
      expect(github.repos.update).toHaveBeenCalled()
    })
  })

})
