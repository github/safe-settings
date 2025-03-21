const CustomProperties = require('../../../../lib/plugins/custom_properties')

describe('CustomProperties', () => {
  const nop = false
  let github
  let log

  const owner = 'test-owner'
  const repo = 'test-repo'

  function configure (config) {
    return new CustomProperties(nop, github, { owner, repo }, config, log, [])
  }

  beforeEach(() => {
    github = {
      paginate: jest.fn(),
      repos: {
        getCustomPropertiesValues: jest.fn(),
        createOrUpdateCustomPropertiesValues: jest.fn()
      }
    }

    log = { debug: jest.fn(), error: console.error }
  })

  describe('Custom Properties plugin', () => {
    it('should normalize entries when be instantiated', () => {
      const plugin = configure([{ name: 'Test', value: 'test' }])
      expect(plugin.entries).toEqual([{ name: 'test', value: 'test' }])
    })

    it('should fetch and normalize custom properties successfully', async () => {
      const mockResponse = [
        { property_name: 'Test1', value: 'value1' },
        { property_name: 'Test2', value: 'value2' }
      ]

      github.paginate.mockResolvedValue(mockResponse)

      const plugin = configure()
      const result = await plugin.find()

      expect(github.paginate).toHaveBeenCalledWith(
        github.repos.getCustomPropertiesValues,
        {
          owner,
          repo,
          per_page: 100
        }
      )

      expect(result).toEqual([
        { name: 'test1', value: 'value1' },
        { name: 'test2', value: 'value2' }
      ])
    })

    it('should sync', async () => {
      const mockResponse = [
        { property_name: 'no-change', value: 'no-change' },
        { property_name: 'new-value', value: '' },
        { property_name: 'update-value', value: 'update-value' },
        { property_name: 'delete-value', value: 'update-value' }
      ]

      github.paginate.mockResolvedValue(mockResponse)

      const plugin = configure([
        { name: 'no-change', value: 'no-change' },
        { name: 'new-value', value: 'new-value' },
        { name: 'update-value', value: 'new-value' },
        { name: 'delete-value', value: null }
      ])

      return plugin.sync().then(() => {
        expect(github.paginate).toHaveBeenCalledWith(
          github.repos.getCustomPropertiesValues,
          {
            owner,
            repo,
            per_page: 100
          }
        )
        expect(github.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'no-change',
              value: 'no-change'
            }
          ]
        })
        expect(github.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'new-value',
              value: 'new-value'
            }
          ]
        })
        expect(github.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'update-value',
              value: 'new-value'
            }
          ]
        })
        expect(github.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'delete-value',
              value: null
            }
          ]
        })
      })

      // const plugin = configure([{ name: 'Test', value: 'test' }])
      // await plugin.update({ name: 'test', value: 'old' }, { name: 'test', value: 'test' })

      // expect(github.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
      //   owner,
      //   repo,
      //   properties: [
      //     {
      //       property_name: 'test',
      //       value: 'test'
      //     }
      //   ]
      // })
    })
  })
})
