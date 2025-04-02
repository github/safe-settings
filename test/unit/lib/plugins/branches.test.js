/* eslint-disable no-undef */

const { when } = require('jest-when')
const Branches = require('../../../../lib/plugins/branches')

describe('Branches', () => {
  let github
  const log = jest.fn()
  log.debug = jest.fn()
  log.error = jest.fn()

  function configure (config) {
    const nop = false
    const errors = []
    return new Branches(nop, github, { owner: 'bkeepers', repo: 'test' }, config, log, errors)
  }

  beforeEach(() => {
    github = {
      repos: {
        get: jest.fn().mockResolvedValue({
          data: {
            default_branch: 'main'
          }
        }),
        getBranchProtection: jest.fn().mockResolvedValue({
          data: {
            enforce_admins: { enabled: false }
          }
        }),
        updateBranchProtection: jest.fn().mockImplementation(() => Promise.resolve('updateBranchProtection')),
        deleteBranchProtection: jest.fn().mockImplementation(() => Promise.resolve('deleteBranchProtection'))
      }
    }
  })

  describe('sync', () => {
    it('syncs branch protection settings', () => {
      const plugin = configure(
        [{
          name: 'master',
          protection: {
            required_status_checks: {
              strict: true,
              contexts: ['travis-ci']
            },
            enforce_admins: true,
            required_pull_request_reviews: {
              require_code_owner_reviews: true
            }
          }
        }]
      )

      return plugin.sync().then(() => {
        expect(github.repos.updateBranchProtection).toHaveBeenCalledWith({
          owner: 'bkeepers',
          repo: 'test',
          branch: 'master',
          required_status_checks: {
            strict: true,
            contexts: ['travis-ci']
          },
          enforce_admins: true,
          required_pull_request_reviews: {
            require_code_owner_reviews: true
          },
          headers: { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }
        })
      })
    })

    describe('when the "protection" config is empty object', () => {
      it('removes branch protection', () => {
        const plugin = configure(
          [{
            name: 'master',
            protection: {}
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).not.toHaveBeenCalled()
          expect(github.repos.deleteBranchProtection).toHaveBeenCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'master'
          })
        })
      })
    })

    describe('when the "protection" config is set to `null`', () => {
      it('removes branch protection', () => {
        const plugin = configure(
          [{
            name: 'master',
            protection: null
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).not.toHaveBeenCalled()
          expect(github.repos.deleteBranchProtection).toHaveBeenCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'master'
          })
        })
      })
    })

    describe('when the "protection" config is set to an empty array', () => {
      it('removes branch protection', () => {
        const plugin = configure(
          [{
            name: 'master',
            protection: []
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).not.toHaveBeenCalled()
          expect(github.repos.deleteBranchProtection).toHaveBeenCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'master'
          })
        })
      })
    })

    describe('when the "protection" config is set to `false`', () => {
      it('removes branch protection', () => {
        const plugin = configure(
          [{
            name: 'master',
            protection: false
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).not.toHaveBeenCalled()
          expect(github.repos.deleteBranchProtection).toHaveBeenCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'master'
          })
        })
      })
    })

    describe('when the "protection" key is not present', () => {
      it('makes no change to branch protection', () => {
        const plugin = configure(
          [{
            name: 'master'
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).not.toHaveBeenCalled()
          expect(github.repos.deleteBranchProtection).not.toHaveBeenCalled()
        })
      })
    })

    describe('when {{EXTERNALLY_DEFINED}} is present in "required_status_checks" and no status checks exist in GitHub', () => {
      it('it initialises the status checks with an empty list', () => {
        const plugin = configure(
          [{
            name: 'main',
            protection: {
              required_status_checks: {
                strict: true,
                contexts: ['{{travis-ci', '{{EXTERNALLY_DEFINED}}']
              }
            }
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).toHaveBeenCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'main',
            required_status_checks: {
              strict: true,
              contexts: []
            },
            headers: { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }
          })
        })
      })
    })

    describe('when {{EXTERNALLY_DEFINED}} is present in "required_status_checks" and status checks exist in GitHub', () => {
      it('it retains the status checks from GitHub', () => {
        github.repos.getBranchProtection = jest.fn().mockResolvedValue({
          data: {
            enforce_admins: { enabled: false },
            protection: {
              required_status_checks: {
                contexts: ['check-1', 'check-2']
              }
            }
          }
        })
        const plugin = configure(
          [{
            name: 'main',
            protection: {
              required_status_checks: {
                strict: true,
                contexts: ['{{travis-ci', '{{EXTERNALLY_DEFINED}}']
              }
            }
          }]
        )

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).toHaveBeenCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'main',
            required_status_checks: {
              strict: true,
              contexts: ['check-1', 'check-2']
            },
            headers: { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }
          })
        })
      })
    })

    describe('when multiple branches are configured', () => {
      it('updates them each appropriately', () => {
        const plugin = configure(
          [
            {
              name: 'master',
              protection: { enforce_admins: true }
            },
            {
              name: 'other',
              protection: { enforce_admins: false }
            }
          ]
        )

        when(github.repos.getBranchProtection)
          .calledWith(expect.objectContaining({
            branch: 'other'
          })).mockResolvedValue({
            data: {
              enforce_admins: { enabled: true }
            }
          })

        return plugin.sync().then(() => {
          expect(github.repos.updateBranchProtection).toHaveBeenCalledTimes(2)

          expect(github.repos.updateBranchProtection).toHaveBeenLastCalledWith({
            owner: 'bkeepers',
            repo: 'test',
            branch: 'other',
            enforce_admins: false,
            headers: { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }
          })
        })
      })
    })
  })

  describe.skip('return values', () => {
    it('returns updateBranchProtection Promise', () => {
      const plugin = configure(
        [{
          name: 'master',
          protection: { enforce_admins: true }
        }]
      )

      return plugin.sync().then(result => {
        expect(result.length).toBe(1)
        expect(result[0]).toBe('updateBranchProtection')
      })
    })
    it('returns deleteBranchProtection Promise', () => {
      const plugin = configure(
        [{
          name: 'master',
          protection: null
        }]
      )

      return plugin.sync().then(result => {
        expect(result.length).toBe(1)
        expect(result[0]).toBe('deleteBranchProtection')
      })
    })
  })
})
