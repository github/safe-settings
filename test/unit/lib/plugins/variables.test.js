const { when } = require('jest-when')
const Variables = require('../../../../lib/plugins/variables')

describe('Variables', () => {
  let github
  const org = 'bkeepers'
  const repo = 'test'

  function fillVariables (variables = []) {
    return variables
  }

  function configure () {
    const log = { debug: console.debug, error: console.error }
    const errors = []
    return new Variables(undefined, github, { owner: org, repo }, [{ name: 'test', value: 'test' }], log, errors)
  }

  beforeAll(() => {
    github = {
      request: jest.fn().mockReturnValue(Promise.resolve(true))
    }
  })

  it('sync', () => {
    const plugin = configure()

    when(github.request)
      .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
      .mockResolvedValue({
        data: {
          variables: [
            fillVariables({
              variables: []
            })
          ]
        }
      });

    ['variables'].forEach(() => {
      when(github.request)
        .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
        .mockResolvedValue({
          data: {
            variables: [{ name: 'DELETE_me', value: 'test' }]
          }
        })
    })

    when(github.request).calledWith('POST /repos/:org/:repo/actions/variables').mockResolvedValue({})

    return plugin.sync().then(() => {
      expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo });

      ['variables'].forEach(() => {
        expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
      })

      expect(github.request).toHaveBeenCalledWith(
        'DELETE /repos/:org/:repo/actions/variables/:variable_name',
        expect.objectContaining({
          org,
          repo,
          variable_name: 'DELETE_me'
        })
      )

      expect(github.request).toHaveBeenCalledWith(
        'POST /repos/:org/:repo/actions/variables',
        expect.objectContaining({
          org,
          repo,
          name: 'TEST',
          value: 'test'
        })
      )
    })
  })
})
