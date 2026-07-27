const CustomProperties = require('../../../../lib/plugins/custom_properties')
const MergeDeep = require('../../../../lib/mergeDeep')

describe('CustomProperties', () => {
  const nop = false
  let github
  let log
  let errors

  const owner = 'test-owner'
  const repo = 'test-repo'

  function configure (config) {
    return new CustomProperties(nop, github, { owner, repo }, config, log, errors)
  }

  function configureNop (config) {
    return new CustomProperties(true, github, { owner, repo }, config, log, errors)
  }

  beforeEach(() => {
    const createOrUpdateCustomPropertiesValues = jest.fn()
    createOrUpdateCustomPropertiesValues.endpoint = jest.fn(params => ({
      url: `/repos/${params.owner}/${params.repo}/properties/values`,
      body: params
    }))

    github = {
      paginate: jest.fn(),
      rest: {
        repos: {
          getCustomPropertiesValues: jest.fn(),
          createOrUpdateCustomPropertiesValues
        }
      }
    }

    log = { debug: jest.fn(), error: jest.fn() }
    errors = []
  })

  describe('Custom Properties plugin', () => {
    it('should normalize entries when instantiated', () => {
      const plugin = configure([{ name: 'Test', value: 'test' }])
      expect(plugin.entries).toEqual([{ name: 'test', value: 'test' }])
    })

    it('should normalize entries with property_name when instantiated', () => {
      const plugin = configure([{ property_name: 'ent-ownership', value: 'expert-services' }])
      expect(plugin.entries).toEqual([{ name: 'ent-ownership', value: 'expert-services' }])
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
        github.rest.repos.getCustomPropertiesValues,
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

    it('should normalize paginated custom properties when property name shape differs', async () => {
      const mockResponse = [
        { name: 'Owner', value: 'My Team' },
        { property_name: 'Criticality', value: 'High' },
        { value: 'ignored' }
      ]

      github.paginate.mockResolvedValue(mockResponse)

      const plugin = configure()
      const result = await plugin.find()

      expect(result).toEqual([
        { name: 'owner', value: 'My Team' },
        { name: 'criticality', value: 'High' }
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
          github.rest.repos.getCustomPropertiesValues,
          {
            owner,
            repo,
            per_page: 100
          }
        )
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'no-change',
              value: 'no-change'
            }
          ]
        })
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'new-value',
              value: 'new-value'
            }
          ]
        })
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
          owner,
          repo,
          properties: [
            {
              property_name: 'update-value',
              value: 'new-value'
            }
          ]
        })
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
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

      // expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith({
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

  describe('include/exclude config shape', () => {
    // Existing repo state shared by most of the exclude tests: one property
    // managed by safe-settings, one owned by another app, one abandoned.
    function mockExistingProperties (properties) {
      github.paginate.mockResolvedValue(properties)
    }

    function propertyUpdate (name, value) {
      return {
        owner,
        repo,
        properties: [{ property_name: name, value }]
      }
    }

    it('keeps the plain array shape working unchanged', () => {
      mockExistingProperties([
        { property_name: 'jira-team', value: 'Search' },
        { property_name: 'stale-prop', value: 'whatever' }
      ])

      const plugin = configure([
        { name: 'jira-team', value: 'Platform' },
        { name: 'jira-project', value: 'ARCH' }
      ])

      expect(plugin.exclude).toEqual([])

      return plugin.sync().then(() => {
        // update
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('jira-team', 'Platform'))
        // add
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('jira-project', 'ARCH'))
        // remove
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('stale-prop', null))
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(3)
      })
    })

    it('does not null out an unmanaged property matching an exclude pattern', () => {
      mockExistingProperties([
        { property_name: 'jira-team', value: 'Search' },
        { property_name: 'app-deploy-ring', value: 'canary' }
      ])

      const plugin = configure({
        include: [
          { name: 'jira-team', value: 'Platform' },
          { name: 'jira-project', value: 'ARCH' }
        ],
        exclude: [
          { name: '^app-.*' }
        ]
      })

      return plugin.sync().then(() => {
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .not.toHaveBeenCalledWith(propertyUpdate('app-deploy-ring', null))
        // Managed properties are still enforced.
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('jira-team', 'Platform'))
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('jira-project', 'ARCH'))
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(2)
      })
    })

    it('enforces a property that is in include even when it matches exclude', () => {
      mockExistingProperties([
        { property_name: 'app-owner', value: 'unknown' }
      ])

      const plugin = configure({
        include: [
          { name: 'app-owner', value: 'platform-team' }
        ],
        exclude: [
          { name: '^app-.*' }
        ]
      })

      return plugin.sync().then(() => {
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('app-owner', 'platform-team'))
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(1)
      })
    })

    it('still removes an unmanaged property that matches no exclude pattern', () => {
      mockExistingProperties([
        { property_name: 'app-deploy-ring', value: 'canary' },
        { property_name: 'stale-prop', value: 'leftover' }
      ])

      const plugin = configure({
        include: [
          { name: 'jira-team', value: 'Platform' }
        ],
        exclude: [
          { name: '^app-.*' }
        ]
      })

      return plugin.sync().then(() => {
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .toHaveBeenCalledWith(propertyUpdate('stale-prop', null))
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
          .not.toHaveBeenCalledWith(propertyUpdate('app-deploy-ring', null))
      })
    })

    it('protects properties whose API casing differs from the pattern', () => {
      // The API may return any casing; the plugin normalizes to lowercase, so
      // exclude patterns are matched against the lowercased name.
      mockExistingProperties([
        { property_name: 'APP-Thing', value: 'set-by-an-app' }
      ])

      const plugin = configure({
        include: [],
        exclude: [{ name: '^app-.*' }]
      })

      return plugin.sync().then(() => {
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalled()
      })
    })

    it('produces no Delete NopCommand for an excluded property in nop mode', () => {
      mockExistingProperties([
        { property_name: 'app-deploy-ring', value: 'canary' },
        { property_name: 'stale-prop', value: 'leftover' }
      ])

      const plugin = configureNop({
        include: [{ name: 'jira-team', value: 'Platform' }],
        exclude: [{ name: '^app-.*' }]
      })

      return plugin.sync().then(res => {
        const commands = res.flat().filter(c => c && c.action)
        const deletes = commands.filter(c => c.action.msg === 'Delete Custom Property')

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalled()
        expect(deletes).toHaveLength(1)
        expect(deletes[0].body.properties).toEqual([
          { property_name: 'stale-prop', value: null }
        ])
      })
    })

    describe('degenerate shapes', () => {
      it('accepts include without exclude', () => {
        const plugin = configure({
          include: [{ name: 'Jira-Team', value: 'Platform' }]
        })

        expect(plugin.entries).toEqual([{ name: 'jira-team', value: 'Platform' }])
        expect(plugin.exclude).toEqual([])
      })

      it('accepts exclude without include, managing nothing', () => {
        mockExistingProperties([
          { property_name: 'app-thing', value: 'a' },
          { property_name: 'other-thing', value: 'b' }
        ])

        const plugin = configure({
          exclude: [{ name: '^app-.*' }]
        })

        expect(plugin.entries).toEqual([])

        // An empty include list means safe-settings owns the whole surface, so
        // everything not protected by `exclude` is still nulled out.
        return plugin.sync().then(() => {
          expect(github.rest.repos.createOrUpdateCustomPropertiesValues)
            .toHaveBeenCalledWith(propertyUpdate('other-thing', null))
          expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(1)
        })
      })

      it('does not throw on a null config', () => {
        let plugin
        expect(() => { plugin = configure(null) }).not.toThrow()
        expect(plugin.entries).toBeNull()
        expect(plugin.exclude).toEqual([])
        expect(plugin.sync()).toBeUndefined()
      })

      it('does not throw on an undefined config', () => {
        let plugin
        expect(() => { plugin = configure(undefined) }).not.toThrow()
        expect(plugin.exclude).toEqual([])
      })

      it('ignores exclude entries without a name string', () => {
        const plugin = configure({
          include: [{ name: 'jira-team', value: 'Platform' }],
          exclude: [{ name: '^app-.*' }, {}, null, { value: 'nope' }, { name: 42 }]
        })

        expect(plugin.exclude).toHaveLength(1)
        expect(plugin.isExcluded('app-thing')).toBe(true)
      })

      it('ignores a non-array exclude', () => {
        const plugin = configure({
          include: [{ name: 'jira-team', value: 'Platform' }],
          exclude: 'app-'
        })

        expect(plugin.exclude).toEqual([])
        expect(plugin.entries).toEqual([{ name: 'jira-team', value: 'Platform' }])
      })
    })

    describe('malformed object config', () => {
      it('does not throw on an empty object', () => {
        expect(() => configure({})).not.toThrow()
      })

      it('fails closed and reports a config error for an empty object', () => {
        const plugin = configure({})

        expect(plugin.entries).toEqual([])
        expect(plugin.excludeAll).toBe(true)
        expect(errors).toHaveLength(1)
        expect(errors[0].msg).toMatch(/must be a list of properties or an object with `include`/)
      })

      it('clears nothing when the config is an empty object', async () => {
        github.paginate.mockResolvedValue([{ property_name: 'deploy-status', value: 'green' }])

        const plugin = configure({})
        await plugin.sync()

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalled()
      })

      it('fails closed when include is present but not an array', async () => {
        github.paginate.mockResolvedValue([{ property_name: 'deploy-status', value: 'green' }])

        const plugin = configure({ include: 'not-a-list' })
        await plugin.sync()

        expect(plugin.excludeAll).toBe(true)
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalled()
      })
    })

    describe('pattern casing', () => {
      it('matches an uppercase pattern against the lowercased property name', () => {
        const plugin = configure({ include: [], exclude: [{ name: '^Deploy-Status$' }] })

        expect(plugin.isExcluded('deploy-status')).toBe(true)
      })

      it('does not clear a property whose exclude pattern was written in uppercase', async () => {
        github.paginate.mockResolvedValue([{ property_name: 'Deploy-Status', value: 'green' }])

        const plugin = configure({ include: [], exclude: [{ name: '^Deploy-' }] })
        await plugin.sync()

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalled()
      })
    })

    describe('invalid exclude patterns', () => {
      it('records a config error instead of throwing', () => {
        let plugin
        expect(() => {
          plugin = configure({
            include: [{ name: 'jira-team', value: 'Platform' }],
            exclude: [{ name: '^app-.*' }, { name: '[unterminated' }]
          })
        }).not.toThrow()

        expect(plugin.exclude).toHaveLength(1)
        expect(plugin.isExcluded('app-thing')).toBe(true)

        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatchObject({
          owner,
          repo,
          plugin: 'CustomProperties'
        })
        expect(errors[0].msg).toMatch(/Invalid custom property exclude pattern "\[unterminated"/)
      })

      it('fails closed - an invalid pattern excludes every property', () => {
        const plugin = configure({ include: [], exclude: [{ name: '[unterminated' }] })

        expect(plugin.excludeAll).toBe(true)
        expect(plugin.isExcluded('anything-at-all')).toBe(true)
      })

      it('clears nothing when a glob "*" is used instead of the regex ".*"', async () => {
        github.paginate.mockResolvedValue([
          { property_name: 'deploy-status', value: 'green' },
          { property_name: 'cost-center', value: '4417' }
        ])

        const plugin = configure({ include: [], exclude: [{ name: '*' }] })
        await plugin.sync()

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalled()
        expect(errors).toHaveLength(1)
      })

      it('still enforces included properties when an invalid pattern fails closed', async () => {
        github.paginate.mockResolvedValue([
          { property_name: 'jira-team', value: 'OldTeam' },
          { property_name: 'deploy-status', value: 'green' }
        ])

        const plugin = configure({
          include: [{ name: 'jira-team', value: 'Platform' }],
          exclude: [{ name: '*' }]
        })
        await plugin.sync()

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(1)
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith(
          expect.objectContaining({
            properties: [{ property_name: 'jira-team', value: 'Platform' }]
          })
        )
      })
    })

    // `Settings.childPluginsList` merges the org, suborg and repo configs with
    // MergeDeep before handing the result to the plugin, so the config the plugin
    // actually receives is not the config any single file declares. These use the
    // real MergeDeep to assert against that merged shape.
    describe('config merged across org, suborg and repo scopes', () => {
      function mergeScopes (...scopes) {
        const mergeDeep = new MergeDeep(log, github, ['id', 'node_id', 'default', 'url'])
        const sources = scopes.map(scope => ({ custom_properties: scope }))
        return mergeDeep.mergeDeep({}, ...sources).custom_properties
      }

      it('leaves a plain array config untouched through the merge', () => {
        const merged = mergeScopes(
          [{ name: 'jira-team', value: 'Platform' }],
          [{ name: 'jira-team', value: 'RepoTeam' }]
        )

        expect(Array.isArray(merged)).toBe(true)
        expect(merged).toEqual([{ name: 'jira-team', value: 'RepoTeam' }])
      })

      it('accumulates exclude patterns from every scope', () => {
        const merged = mergeScopes(
          { include: [{ name: 'jira-team', value: 'Platform' }], exclude: [{ name: '^app-' }] },
          { exclude: [{ name: '^deploy-' }] }
        )

        const plugin = configure(merged)

        expect(plugin.exclude).toHaveLength(2)
        expect(plugin.isExcluded('app-owner')).toBe(true)
        expect(plugin.isExcluded('deploy-status')).toBe(true)
        expect(plugin.isExcluded('jira-team')).toBe(false)
      })

      it('lets a narrower scope override an included value while keeping org excludes', async () => {
        github.paginate.mockResolvedValue([
          { property_name: 'jira-team', value: 'OldTeam' },
          { property_name: 'app-owner', value: 'team-a' }
        ])

        const merged = mergeScopes(
          { include: [{ name: 'jira-team', value: 'Platform' }], exclude: [{ name: '^app-' }] },
          { include: [{ name: 'jira-team', value: 'RepoTeam' }] }
        )

        const plugin = configure(merged)
        await plugin.sync()

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(1)
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith(
          expect.objectContaining({
            properties: [{ property_name: 'jira-team', value: 'RepoTeam' }]
          })
        )
      })

      it('applies includes contributed by different scopes together', async () => {
        github.paginate.mockResolvedValue([])

        const merged = mergeScopes(
          { include: [{ name: 'jira-team', value: 'Platform' }], exclude: [{ name: '.*' }] },
          { include: [{ name: 'tier', value: 'gold' }] }
        )

        const plugin = configure(merged)
        await plugin.sync()

        const written = github.rest.repos.createOrUpdateCustomPropertiesValues.mock.calls
          .map(call => call[0].properties[0])

        expect(written).toEqual(
          expect.arrayContaining([
            { property_name: 'jira-team', value: 'Platform' },
            { property_name: 'tier', value: 'gold' }
          ])
        )
      })

      it('keeps an org-level exclude protecting properties when a repo adds an include', async () => {
        github.paginate.mockResolvedValue([
          { property_name: 'deploy-status', value: 'green' },
          { property_name: 'cost-center', value: '4417' }
        ])

        const merged = mergeScopes(
          { exclude: [{ name: '.*' }] },
          { include: [{ name: 'tier', value: 'gold' }] }
        )

        const plugin = configure(merged)
        await plugin.sync()

        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledTimes(1)
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).toHaveBeenCalledWith(
          expect.objectContaining({
            properties: [{ property_name: 'tier', value: 'gold' }]
          })
        )
      })

      // Mixing the two shapes across scopes merges the array into the object under
      // numeric keys. The same happens for `labels`, which shares this array-or-object
      // config duality. The plugin must not throw on it, and the declared
      // include/exclude must still be honoured.
      it('does not throw when scopes mix the array and object shapes', async () => {
        github.paginate.mockResolvedValue([
          { property_name: 'app-owner', value: 'team-a' }
        ])

        const merged = mergeScopes(
          [{ name: 'jira-team', value: 'Platform' }],
          { include: [{ name: 'tier', value: 'gold' }], exclude: [{ name: '^app-' }] }
        )

        let plugin
        expect(() => { plugin = configure(merged) }).not.toThrow()

        await expect(plugin.sync()).resolves.not.toThrow()

        expect(plugin.isExcluded('app-owner')).toBe(true)
        expect(github.rest.repos.createOrUpdateCustomPropertiesValues).not.toHaveBeenCalledWith(
          expect.objectContaining({
            properties: [{ property_name: 'app-owner', value: null }]
          })
        )
      })
    })
  })
})
