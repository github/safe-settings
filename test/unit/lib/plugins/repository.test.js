const Repository = require('../../../../lib/plugins/repository')

describe('Repository', () => {
  const github = {
    rest: {
      repos: {
        get: jest.fn().mockResolvedValue({
          data: {
            topics: [],
            owner: { login: 'bkeepers' },
            name: 'test'
          }
        }),
        update: jest.fn().mockResolvedValue(),
        replaceAllTopics: jest.fn().mockResolvedValue()
      }
    },
    request: jest.fn().mockResolvedValue()
  }
  github.request.endpoint = jest.fn().mockReturnValue({})
  const log = jest.fn()
  log.debug = jest.fn()
  log.error = jest.fn()

  function configure (config) {
    const nop = false
    const errors = []
    return new Repository(nop, github, { owner: 'bkeepers', repo: 'test' }, config, 1, log, errors)
  }

  describe('sync', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    it('syncs repository settings', () => {
      const plugin = configure({
        name: 'test',
        description: 'Hello World!',
        topics: []
      })
      return plugin.sync().then(() => {
        expect(github.rest.repos.update).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          name: 'test',
          description: 'Hello World!',
          mediaType: { previews: ['nebula-preview'] }
        })
      })
    })

    it('handles renames', () => {
      const plugin = configure({
        name: 'new-name'
      })
      return plugin.sync().then(() => {
        expect(github.rest.repos.update).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          name: 'new-name',
          mediaType: { previews: ['nebula-preview'] }
        })
      })
    })

    it('syncs topics', () => {
      const plugin = configure({
        topics: ['foo', 'bar']
      })

      return plugin.sync().then(() => {
        expect(github.rest.repos.replaceAllTopics).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          names: ['foo', 'bar'],
          mediaType: {
            previews: ['mercy']
          }
        })
      })
    })

    it('enables release immutability', () => {
      const plugin = configure({
        releases: { immutable: true }
      })

      return plugin.sync().then(() => {
        expect(github.request).toHaveBeenCalledWith(
          'PUT /repos/{owner}/{repo}/releases/immutability',
          { owner: 'bkeepers', repo: 'test' }
        )
      })
    })

    it('disables release immutability', () => {
      const plugin = configure({
        releases: { immutable: false }
      })

      return plugin.sync().then(() => {
        expect(github.request).toHaveBeenCalledWith(
          'DELETE /repos/{owner}/{repo}/releases/immutability',
          { owner: 'bkeepers', repo: 'test' }
        )
      })
    })

    it('does not call release immutability API when releases setting is absent', () => {
      const plugin = configure({
        name: 'test'
      })

      return plugin.sync().then(() => {
        expect(github.request).not.toHaveBeenCalledWith(
          expect.stringMatching(/releases\/immutability/),
          expect.anything()
        )
      })
    })
  })
})
