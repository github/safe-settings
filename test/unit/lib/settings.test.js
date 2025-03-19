/* eslint-disable no-undef */
const { Octokit } = require('@octokit/core')
const Settings = require('../../../lib/settings')
const yaml = require('js-yaml')
const ConfigManager = require('../../../lib/configManager')
// jest.mock('../../../lib/settings', () => {
//   const OriginalSettings = jest.requireActual('../../../lib/settings')
//   //const orginalSettingsInstance = new OriginalSettings(false, stubContext, mockRepo, config, mockRef, mockSubOrg)
//   return OriginalSettings
// })

jest.mock('../../../lib/plugins/repository.js', () => jest.fn(() => ({
  sync: jest.fn(async () => ({}))
})))
const mockRepoPlugin = require('../../../lib/plugins/repository.js')

jest.mock('../../../lib/plugins/custom_properties.js', () => jest.fn(() => ({
  sync: jest.fn(async () => ({}))
})))
const mockCustomPropsPlugin = require('../../../lib/plugins/custom_properties.js')

describe('Settings Tests', () => {
  let stubContext
  let mockRepo
  let stubConfig
  let mockRef
  let mockSubOrg
  let subOrgConfig
  let mockOctokit

  function createSettings(config) {
    const settings = new Settings(false, stubContext, mockRepo, config, mockRef, mockSubOrg)
    return settings;
  }

  beforeEach(() => {
    mockOctokit = jest.mocked(Octokit)
    const content = Buffer.from(`
suborgrepos:
- new-repo
#- test*
#- secret*

suborgteams:
- core

suborgproperties:
- EDP: true
- do_no_delete: true

teams:
  - name: core
    permission: bypass
  - name: docss
    permission: pull
  - name: docs
    permission: pull

validator:
  pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*'

repository:
  # A comma-separated list of topics to set on the repository
  topics:
  - frontend
     `).toString('base64');
    mockOctokit.repos = {
      getContent: jest.fn().mockResolvedValue({ data: { content } })
    }

    mockOctokit.request = {
      endpoint: jest.fn().mockReturnValue({})
    }

    mockOctokit.paginate = jest.fn().mockResolvedValue([])

    stubContext = {
      payload: {
        installation: {
          id: 123
        }
      },
      octokit: mockOctokit,
      log: {
        debug: jest.fn((msg) => {
          console.log(msg)
        }),
        info: jest.fn((msg) => {
          console.log(msg)
        }),
        error: jest.fn((msg) => {
          console.log(msg)
        })
      }
    }

    mockRepo = { owner: 'test', repo: 'test-repo' }
    mockRef = 'main'
    mockSubOrg = 'frontend'

    jest.clearAllMocks()
  })

  describe('restrictedRepos', () => {
    describe('restrictedRepos not defined', () => {
      beforeEach(() => {
        stubConfig = {
          restrictedRepos: {
          }
        }
      })

      it('Allow repositories being configured', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('my-repo')).toEqual(false)
        expect(settings.isRestricted('another-repo')).toEqual(false)
      })

      it('Do not allow default excluded repositories being configured', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('.github')).toEqual(false)
        expect(settings.isRestricted('safe-settings')).toEqual(false)
        expect(settings.isRestricted('admin')).toEqual(false)
      })
    })

    describe('restrictedRepos.exclude defined', () => {
      beforeEach(() => {
        stubConfig = {
          restrictedRepos: {
            exclude: ['foo', '.*-test$', '^personal-.*$']
          }
        }
      })

      it('Skipping excluded repository from being configured', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('foo')).toEqual(true)
      })

      it('Skipping excluded repositories matching regex in restrictedRepos.exclude', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('my-repo-test')).toEqual(true)
        expect(settings.isRestricted('personal-repo')).toEqual(true)
      })

      it('Allowing repositories not matching regex in restrictedRepos.exclude', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('my-repo-test-data')).toEqual(false)
        expect(settings.isRestricted('personalization-repo')).toEqual(false)
      })
    })

    describe('restrictedRepos.include defined', () => {
      beforeEach(() => {
        stubConfig = {
          restrictedRepos: {
            include: ['foo', '.*-test$', '^personal-.*$']
          }
        }
      })

      it('Allowing repository from being configured', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('foo')).toEqual(false)
      })

      it('Allowing repositories matching regex in restrictedRepos.include', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('my-repo-test')).toEqual(false)
        expect(settings.isRestricted('personal-repo')).toEqual(false)
      })

      it('Skipping repositories not matching regex in restrictedRepos.include', () => {
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('my-repo-test-data')).toEqual(true)
        expect(settings.isRestricted('personalization-repo')).toEqual(true)
      })
    })

    describe('restrictedRepos not defined', () => {
      it('Throws TypeError if restrictedRepos not defined', () => {
        stubConfig = {}
        settings = createSettings(stubConfig)
        expect(() => settings.isRestricted('my-repo')).toThrow('Cannot read properties of undefined (reading \'include\')')
      })

      it('Throws TypeError if restrictedRepos is null', () => {
        stubConfig = {
          restrictedRepos: null
        }
        settings = createSettings(stubConfig)
        expect(() => settings.isRestricted('my-repo')).toThrow('Cannot read properties of null (reading \'include\')')
      })

      it('Allowing all repositories if restrictedRepos is empty', () => {
        stubConfig = {
          restrictedRepos: []
        }
        settings = createSettings(stubConfig)
        expect(settings.isRestricted('my-repo')).toEqual(false)
      })
    })
  }) // restrictedRepos

  describe('getRepoOverrideConfig', () => {
    describe('repository defined in a file using the .yaml extension', () => {
      beforeEach(() => {
        stubConfig = {
          repoConfigs: {
            'repository.yaml': { repository: { name: 'repository', config: 'config1' } }
          }
        }
      })

      it('Picks up a repository defined in file using the .yaml extension', () => {
        settings = createSettings(stubConfig)
        settings.repoConfigs = stubConfig.repoConfigs
        const repoConfig = settings.getRepoOverrideConfig('repository')

        expect(typeof repoConfig).toBe('object')
        expect(repoConfig).not.toBeNull()
        expect(Object.keys(repoConfig).length).toBeGreaterThan(0)
      })
    })

    describe('repository defined in a file using the .yml extension', () => {
      beforeEach(() => {
        stubConfig = {
          repoConfigs: {
            'repository.yml': { repository: { name: 'repository', config: 'config1' } }
          }
        }
      })

      it('Picks up a repository defined in file using the .yml extension', () => {
        settings = createSettings(stubConfig)
        settings.repoConfigs = stubConfig.repoConfigs
        const repoConfig = settings.getRepoOverrideConfig('repository')

        expect(typeof repoConfig).toBe('object')
        expect(repoConfig).not.toBeNull()
        expect(Object.keys(repoConfig).length).toBeGreaterThan(0)
      })
    })
  }) // repoOverrideConfig
  describe('loadConfigs', () => {
    describe('load suborg configs', () => {
      beforeEach(() => {
        stubConfig = {
          restrictedRepos: {
          }
        }
        subOrgConfig = yaml.load(`
          suborgrepos:
          - new-repo

          suborgproperties:
          - EDP: true
          - do_no_delete: true

          teams:
            - name: core
              permission: bypass
            - name: docss
              permission: pull
            - name: docs
              permission: pull

          validator:
            pattern: '[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+.*'

          repository:
            # A comma-separated list of topics to set on the repository
            topics:
            - frontend

          `)
      })

      it("Should load configMap for suborgs'", async () => {
        //mockSubOrg = jest.fn().mockReturnValue(['suborg1', 'suborg2'])
        mockSubOrg = undefined
        settings = createSettings(stubConfig)
        jest.spyOn(settings, 'loadConfigMap').mockImplementation(() => [{ name: "frontend", path: ".github/suborgs/frontend.yml" }])
        jest.spyOn(settings, 'loadYaml').mockImplementation(() => subOrgConfig)
        jest.spyOn(settings, 'getReposForTeam').mockImplementation(() => [{ name: 'repo-test' }])
        jest.spyOn(settings, 'getReposForCustomProperty').mockImplementation(() => [{ repository_name: 'repo-for-property' }])

        const subOrgConfigs = await settings.getSubOrgConfigs()
        expect(settings.loadConfigMap).toHaveBeenCalledTimes(1)

        // Get own properties of subOrgConfigs
        const ownProperties = Object.getOwnPropertyNames(subOrgConfigs);
        expect(ownProperties.length).toEqual(3)
      })

      it("Should throw an error when a repo is found in multiple suborgs configs'", async () => {
        //mockSubOrg = jest.fn().mockReturnValue(['suborg1', 'suborg2'])
        mockSubOrg = undefined
        settings = createSettings(stubConfig)
        jest.spyOn(settings, 'loadConfigMap').mockImplementation(() => [{ name: "frontend", path: ".github/suborgs/frontend.yml" }, { name: "backend", path: ".github/suborgs/backend.yml" }])
        jest.spyOn(settings, 'loadYaml').mockImplementation(() => subOrgConfig)
        jest.spyOn(settings, 'getReposForTeam').mockImplementation(() => [{ name: 'repo-test' }])
        jest.spyOn(settings, 'getReposForCustomProperty').mockImplementation(() => [{ repository_name: 'repo-for-property' }])

        expect(async () => await settings.getSubOrgConfigs()).rejects.toThrow('Multiple suborg configs for new-repo in .github/suborgs/backend.yml and .github/suborgs/frontend.yml')
        // try {
        //   await settings.getSubOrgConfigs()
        // } catch (e) {
        //   console.log(e)
        // }
      })
    })
  }) // loadConfigs

  describe('updateRepos', () => {
    beforeEach(() => {
      repoConfig = {
        repository: {
          description: 'This is a description'
        },
        custom_properties: [{ name: 'test', value: 'test' }]
      }
    })

    describe('without unsafeFields', () => {
      beforeEach(() => {
        stubConfig = {
          restrictedRepos: {},
          unsafeFields: []
        }
      })

      it('should not set the description or custom properties', async () => {
        settings = new Settings(false, stubContext, mockRepo, stubConfig, mockRef, null)

        jest.spyOn(settings, 'loadConfigMap').mockImplementation(() => [])
        jest.spyOn(settings, 'getRepoConfigMap').mockImplementation(() => [])
        jest.spyOn(ConfigManager, 'loadYaml').mockImplementation(() => repoConfig)
        mockOctokit.repos.get = jest.fn().mockResolvedValue({ data: {} })

        await settings.loadConfigs({ repo: 'test-repo' })
        await settings.updateRepos({ repo: 'test-repo' })

        expect(mockRepoPlugin).not.toHaveBeenCalled()
        expect(mockCustomPropsPlugin).not.toHaveBeenCalled()
      })
    })

    describe('with unsafeFields', () => {
      beforeEach(() => {
        stubConfig = {
          restrictedRepos: {},
          unsafeFields: ['/repository/description', '/custom_properties']
        }
      })

      it('should call the plugins to set the values', async () => {
        settings = new Settings(false, stubContext, mockRepo, stubConfig, mockRef, null)

        jest.spyOn(settings, 'loadConfigMap').mockImplementation(() => [])
        jest.spyOn(settings, 'getRepoConfigMap').mockImplementation(() => [])
        jest.spyOn(ConfigManager, 'loadYaml').mockImplementation(() => repoConfig)
        mockOctokit.repos.get = jest.fn().mockResolvedValue({ data: {} })

        await settings.loadConfigs({ repo: 'test-repo' })
        await settings.updateRepos({ repo: 'test-repo' })

        expect(mockRepoPlugin).toHaveBeenCalledWith(false, expect.anything(), {"repo": "test-repo"}, { "description": "This is a description" }, 123, expect.anything(), [])
        expect(mockCustomPropsPlugin).toHaveBeenCalledWith(false, expect.anything(), {"repo": "test-repo"}, [{"name": "test", "value": "test"}], expect.anything(), [])
      })
    })
  }) // updateRepos
}) // Settings Tests
