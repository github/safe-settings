const CustomProperties = require('../../../../lib/plugins/custom_properties')

describe('CustomProperties', () => {
  let github
  let log

  function configure (config) {
    const nop = false
    const errors = []
    return new CustomProperties(nop, github, { owner: 'bkeepers', repo: 'test' }, config, log, errors)
  }

  beforeEach(() => {
    github = {
      request: jest.fn()
      //     .mockResolvedValue({
      //     data: [
      //         { property_name: 'test', value: 'test' }
      //     ]
      // })
    }
    log = { debug: jest.fn(), error: console.error }
  })

  describe('sync', () => {
    it('syncs custom properties', async () => {
      const plugin = configure([
        { name: 'test', value: 'test' }
      ])

      github.request.mockResolvedValue({
        data: [
          { property_name: 'test', value: 'test' }
        ]
      })

      return plugin.sync().then(() => {
        expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test'
        })
      })
    })
  })
  describe('sync', () => {
    it('add custom properties', async () => {
      const plugin = configure([
        { name: 'test', value: 'test' }
      ])

      github.request.mockResolvedValue({
        data: []
      })

      return plugin.sync().then(() => {
        expect(github.request).toHaveBeenNthCalledWith(1, 'GET /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test'
        })
        expect(github.request).toHaveBeenNthCalledWith(2, 'PATCH /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test',
          properties: [
            {
              property_name: 'test',
              value: 'test'
            }
          ]
        })
      })
    })
  })
  describe('sync', () => {
    it('remove custom properties', async () => {
      const plugin = configure([])

      github.request.mockResolvedValue({
        data: [{ property_name: 'test', value: 'test' }]
      })

      return plugin.sync().then(() => {
        expect(github.request).toHaveBeenNthCalledWith(1, 'GET /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test'
        })
        expect(github.request).toHaveBeenNthCalledWith(2, 'PATCH /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test',
          properties: [
            {
              property_name: 'test',
              value: null
            }
          ]
        })
      })
    })
  })
  describe('sync', () => {
    it('update custom properties', async () => {
      const plugin = configure([
        { name: 'test', value: 'foobar' }
      ])

      github.request.mockResolvedValue({
        data: [{ property_name: 'test', value: 'test' }]
      })

      return plugin.sync().then(() => {
        expect(github.request).toHaveBeenNthCalledWith(1, 'GET /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test'
        })
        expect(github.request).toHaveBeenNthCalledWith(2, 'PATCH /repos/:org/:repo/properties/values', {
          org: 'bkeepers',
          repo: 'test',
          properties: [
            {
              property_name: 'test',
              value: 'foobar'
            }
          ]
        })
      })
    })
  })
})
