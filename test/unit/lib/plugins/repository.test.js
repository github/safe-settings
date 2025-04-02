const Repository = require('../../../../lib/plugins/repository')

describe('Repository', () => {
  const github = {
    repos: {
      get: jest.fn().mockResolvedValue({
        data: {
          topics: []
        }
      }),
      update: jest.fn().mockResolvedValue(),
      replaceAllTopics: jest.fn().mockResolvedValue()
    }
  }
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
        expect(github.repos.update).toHaveBeenCalledWith({
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
        expect(github.repos.update).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          name: 'new-name',
          mediaType: { previews: ['nebula-preview'] }
        })
      })
    })

    it.only('syncs topics', () => {
      const plugin = configure({
        topics: ['foo', 'bar']
      })

      return plugin.sync().then(() => {
        expect(github.repos.replaceAllTopics).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          names: ['foo', 'bar'],
          mediaType: {
            previews: ['mercy']
          }
        })
      })
    })
  })
})
