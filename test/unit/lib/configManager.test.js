/* eslint-disable no-undef */
const ConfigManager = require('../../../lib/configManager')

describe('configManager', () => {
  let context

  beforeEach(() => {
    context = {
      repo: () => { return { owner: 'test-org', repo: 'admin' } },
      octokit: {
        rest: {
          repos: {
            getContent: jest.fn()
          }
        }
      },
      log: {
        debug: jest.fn(),
        info: jest.fn(),
        error: jest.fn()
      }
    }
  })

  describe('loadYaml', () => {
    it('returns the parsed YAML content when the file is fetched successfully', async () => {
      const configManager = new ConfigManager(context, 'main')
      context.octokit.rest.repos.getContent.mockResolvedValue({
        data: { content: Buffer.from('key: value').toString('base64') }
      })

      const result = await configManager.loadYaml('.github/settings.yml')

      expect(result).toEqual({ key: 'value' })
      expect(context.octokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: 'test-org',
        repo: 'admin',
        path: '.github/settings.yml',
        ref: 'main'
      })
    })

    it('returns null when the path is a folder', async () => {
      const configManager = new ConfigManager(context, 'main')
      context.octokit.rest.repos.getContent.mockResolvedValue({ data: [] })

      await expect(configManager.loadYaml('.github')).resolves.toBeNull()
    })

    it('returns undefined when the path is a symlink or submodule', async () => {
      const configManager = new ConfigManager(context, 'main')
      context.octokit.rest.repos.getContent.mockResolvedValue({ data: { content: null } })

      await expect(configManager.loadYaml('.github/settings.yml')).resolves.toBeUndefined()
    })

    it('returns null when the file does not exist', async () => {
      const configManager = new ConfigManager(context, 'main')
      const notFound = new Error('Not Found')
      notFound.status = 404
      context.octokit.rest.repos.getContent.mockRejectedValue(notFound)

      await expect(configManager.loadYaml('.github/settings.yml')).resolves.toBeNull()
    })

    it('propagates a non-404 error instead of masking it', async () => {
      const configManager = new ConfigManager(context, 'main')
      const serverError = new Error('Internal Server Error')
      serverError.status = 500
      context.octokit.rest.repos.getContent.mockRejectedValue(serverError)

      await expect(configManager.loadYaml('.github/settings.yml')).rejects.toThrow('Internal Server Error')
    })

    it('propagates the original error object so its status is preserved', async () => {
      const configManager = new ConfigManager(context, 'main')
      const forbidden = new Error('Forbidden')
      forbidden.status = 403
      context.octokit.rest.repos.getContent.mockRejectedValue(forbidden)

      await expect(configManager.loadYaml('.github/settings.yml')).rejects.toBe(forbidden)
    })
  })

  describe('loadGlobalSettingsYaml', () => {
    it('loads the settings file from the configured config path', async () => {
      const configManager = new ConfigManager(context, 'main')
      context.octokit.rest.repos.getContent.mockResolvedValue({
        data: { content: Buffer.from('repository:\n  has_wiki: false').toString('base64') }
      })

      const result = await configManager.loadGlobalSettingsYaml()

      expect(result).toEqual({ repository: { has_wiki: false } })
      expect(context.octokit.rest.repos.getContent).toHaveBeenCalledWith(
        expect.objectContaining({ path: '.github/settings.yml' })
      )
    })
  })
})
