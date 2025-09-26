const Archive = require('../../../../lib/plugins/archive')
const NopCommand = require('../../../../lib/nopcommand')

describe('Archive Plugin', () => {
  let archive
  let github
  let repo
  let settings
  let log

  beforeEach(() => {
    github = {
      repos: {
        get: jest.fn(),
        update: jest.fn().mockReturnValue({ data: {} })
      }
    }
    repo = { owner: 'test-owner', repo: 'test-repo' }
    settings = {}
    log = { debug: jest.fn(), warn: jest.fn() }
  })

  describe('getRepo', () => {
    it('returns repository data when found', async () => {
      const mockData = { archived: false }
      github.repos.get.mockResolvedValue({ data: mockData })
      archive = new Archive(false, github, repo, settings, log)

      const result = await archive.getRepo()
      expect(result).toEqual(mockData)
      expect(github.repos.get).toHaveBeenCalledWith({
        owner: repo.owner,
        repo: repo.repo
      })
    })

    it('returns null when repo not found and no archive state defined', async () => {
      github.repos.get.mockRejectedValue({ status: 404 })
      archive = new Archive(false, github, repo, settings, log)

      const result = await archive.getRepo()
      expect(result).toBeNull()
    })

    it('throws error for non-404 errors', async () => {
      const error = { status: 500 }
      github.repos.get.mockRejectedValue(error)
      archive = new Archive(false, github, repo, settings, log)

      await expect(archive.getRepo()).rejects.toEqual(error)
    })
  })

  describe('updateRepoArchiveStatus', () => {
    it('returns NopCommand when nop is true', async () => {
      archive = new Archive(true, github, repo, settings, log)
      const mockEndpoint = { method: 'PATCH', url: '/repos/{owner}/{repo}' }
      github.repos.update.endpoint = jest.fn().mockReturnValue(mockEndpoint)

      const result = await archive.updateRepoArchiveStatus(true)
      expect(result).toBeInstanceOf(NopCommand)
    })

    it('updates repo archive status when nop is false', async () => {
      archive = new Archive(false, github, repo, settings, log)

      await archive.updateRepoArchiveStatus(true)
      expect(github.repos.update).toHaveBeenCalledWith({
        owner: repo.owner,
        repo: repo.repo,
        archived: true
      })
      expect(log.debug).toHaveBeenCalled()
    })
  })

  describe('getDesiredArchiveState', () => {
    it('returns null when archived setting is undefined', () => {
      archive = new Archive(false, github, repo, {}, log)
      expect(archive.getDesiredArchiveState()).toBeNull()
    })

    it('returns boolean when archived is boolean', () => {
      archive = new Archive(false, github, repo, { archived: true }, log)
      expect(archive.getDesiredArchiveState()).toBe(true)
    })

    it('returns boolean for string "true"/"false"', () => {
      archive = new Archive(false, github, repo, { archived: 'true' }, log)
      expect(archive.getDesiredArchiveState()).toBe(true)
    })
  })

  describe('sync', () => {
    beforeEach(() => {
      archive = new Archive(false, github, repo, settings, log)
    })

    it('returns empty results when no archive changes needed', async () => {
      github.repos.get.mockResolvedValue({
        data: { archived: false }
      })
      settings.archived = false

      const results = await archive.sync()
      expect(results).toEqual([])
      expect(log.debug).toHaveBeenCalled()
    })

    it('archives repo when shouldArchive is true', async () => {
      github.repos.get.mockResolvedValue({
        data: { archived: false }
      })
      settings.archived = true

      const results = await archive.sync()
      expect(results).toHaveLength(1)
      expect(github.repos.update).toHaveBeenCalledWith({
        owner: repo.owner,
        repo: repo.repo,
        archived: true
      })
    })
  })
})
