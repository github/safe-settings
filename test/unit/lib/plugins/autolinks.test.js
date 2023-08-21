const Autolinks = require('../../../../lib/plugins/autolinks')

describe('Autolinks', () => {
  let github

  function configure (config) {
    const log = { debug: jest.fn(), error: console.error }
    const nop = false
    return new Autolinks(nop, github, { owner: 'bkeepers', repo: 'test' }, config, log)
  }

  beforeEach(() => {
    github = {
      repos: {
        listAutolinks: jest.fn().mockResolvedValue([]),
        createAutolink: jest.fn().mockResolvedValue(),
        deleteAutolink: jest.fn().mockResolvedValue(),
      }
    }
  })

  describe('sync', () => {
    it('syncs autolinks', () => {
      const plugin = configure([
        { key_prefix: 'ADD-', url_template: 'https://add/<num>' },
        { key_prefix: 'SAME-', url_template: 'https://same/<num>' },
        { key_prefix: 'NEW_URL-', url_template: 'https://new-url/<num>' },
      ])

      github.repos.listAutolinks.mockResolvedValueOnce({
        data: [
          { id: '1', key_prefix: 'SAME-', url_template: 'https://same/<num>', is_alphanumeric: true },
          { id: '2', key_prefix: 'REMOVE-', url_template: 'https://test/<num>', is_alphanumeric: true },
          { id: '3', key_prefix: 'NEW_URL-', url_template: 'https://old-url/<num>', is_alphanumeric: true },
        ]
      })

      return plugin.sync().then(() => {
        expect(github.repos.createAutolink).toHaveBeenCalledWith({
          key_prefix: 'ADD-',
          url_template: 'https://add/<num>',
          owner: 'bkeepers',
          repo: 'test'
        })
      })
    })
  })
})
