const Labels = require('../../../../lib/plugins/labels')

describe('Labels', () => {
  let github
  let log

  function configure (config) {
    const nop = false
    return new Labels(nop, github, { owner: 'bkeepers', repo: 'test' }, config, log)
  }

  beforeEach(() => {
    github = {
      paginate: jest.fn().mockImplementation(() => Promise.resolve()),
      repos: {
        get: jest.fn().mockImplementation(() => Promise.resolve({}))
      },
      issues: {
        listLabelsForRepo: {
          endpoint: {
            merge: jest.fn().mockImplementation(() => {})
          }
        },
        createLabel: jest.fn().mockImplementation(() => Promise.resolve()),
        deleteLabel: jest.fn().mockImplementation(() => Promise.resolve()),
        updateLabel: jest.fn().mockImplementation(() => Promise.resolve())
      }
    }
    log = { debug: jest.fn(), error: console.error }
  })

  describe('sync', () => {
    it('syncs labels', () => {
      github.paginate.mockReturnValueOnce(Promise.resolve([
        { name: 'no-change', color: 'FF0000', description: '' },
        { name: 'new-color', color: 0, description: '' }, // YAML treats `color: 000000` as an integer
        { name: 'new-description', color: '000000', description: '' },
        { name: 'update-me', color: '0000FF', description: '' },
        { name: 'delete-me', color: '000000', description: '' }
      ]))

      const plugin = configure([
        { name: 'no-change', color: 'FF0000', description: '' },
        { name: 'new-name', oldname: 'update-me', color: 'FFFFFF', description: '' },
        { name: 'new-color', color: '999999', description: '' },
        { name: 'new-description', color: '#000000', description: 'Hello world' },
        { name: 'added', description: '' }
      ])

      return plugin.sync().then(() => {
        expect(github.issues.deleteLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          name: 'delete-me',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.createLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          name: 'added',
          description: '',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.updateLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          current_name: 'update-me',
          name: 'new-name',
          color: 'FFFFFF',
          description: '',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.updateLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          current_name: 'new-color',
          name: 'new-color',
          color: '999999',
          description: '',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.updateLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          current_name: 'new-description',
          name: 'new-description',
          color: '000000',
          description: 'Hello world',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.deleteLabel).toHaveBeenCalledTimes(1)
        expect(github.issues.updateLabel).toHaveBeenCalledTimes(3)
        expect(github.issues.createLabel).toHaveBeenCalledTimes(1)
      })
    })

    it('does not delete excluded labels', () => {
      github.paginate.mockReturnValueOnce(Promise.resolve([
        { name: 'no-change', color: 'FF0000', description: '' },
        { name: 'keep-me', color: '000000', description: '' },
        { name: 'things-to-keep', color: '000000', description: '' },
        { name: 'released on @7.x.x', color: '000000', description: '' },
        { name: 'update-me', color: '0000FF', description: '' },
        { name: 'delete-me', color: '000000', description: '' }
      ]))

      const plugin = configure({
        exclude: [
          { name: 'keep' },
          { name: '^released' }
        ],
        include: [
          { name: 'no-change', color: 'FF0000', description: '' },
          { name: 'new-name', oldname: 'update-me', color: 'FFFFFF', description: '' },
          { name: 'added', description: '' }
        ]
      })

      return plugin.sync().then(() => {
        expect(github.issues.deleteLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          name: 'delete-me',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.updateLabel).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          current_name: 'update-me',
          name: 'new-name',
          color: 'FFFFFF',
          description: '',
          headers: { accept: 'application/vnd.github.symmetra-preview+json' }
        })

        expect(github.issues.deleteLabel).toHaveBeenCalledTimes(1)
        expect(github.issues.updateLabel).toHaveBeenCalledTimes(1)
        expect(github.issues.createLabel).toHaveBeenCalledTimes(1)
      })
    })
  })
})
