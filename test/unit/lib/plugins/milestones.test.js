const { getLog } = require('probot/lib/helpers/get-log')
const Milestones = require('../../../../lib/plugins/milestones')

describe('Milestones', () => {
  let github

  const log = getLog()
  log.level = process.env.LOG_LEVEL ?? 'info'
  function configure (config) {
    const noop = false
    const errors = []
    return new Milestones(noop, github, { owner: 'bkeepers', repo: 'test' }, config, log, errors)
  }

  beforeEach(() => {
    github = {
      paginate: jest.fn().mockResolvedValue({}),
      issues: {
        listMilestones: {
          endpoint: {
            merge: jest.fn().mockImplementation(() => ({ route: 'GET /repos/{owner}/{repo}/milestones' }))
          }
        },
        createMilestone: jest.fn().mockImplementation(() => Promise.resolve()),
        deleteMilestone: jest.fn().mockImplementation(() => Promise.resolve()),
        updateMilestone: jest.fn().mockImplementation(() => Promise.resolve())
      }
    }
  })

  describe('sync', () => {
    it('syncs milestones', async () => {
      github.paginate.mockResolvedValueOnce([
        { title: 'no-change', description: 'no-change-description', due_on: null, state: 'open', number: 5 },
        { title: 'new-description', description: 'old-description', due_on: null, state: 'open', number: 2 },
        { title: 'new-state', description: 'FF0000', due_on: null, state: 'open', number: 4 },
        { title: 'remove-milestone', description: 'old-description', due_on: null, state: 'open', number: 1 }
      ])

      const plugin = configure([
        { title: 'no-change', description: 'no-change-description', due_on: '2019-03-29T07:00:00Z', state: 'open' },
        { title: 'new-description', description: 'modified-description' },
        { title: 'new-state', state: 'closed' },
        { title: 'added' }
      ])

      await plugin.sync()

      expect(github.issues.deleteMilestone).toHaveBeenCalledWith({
        owner: 'bkeepers',
        repo: 'test',
        milestone_number: 1
      })

      expect(github.issues.createMilestone).toHaveBeenCalledWith({
        owner: 'bkeepers',
        repo: 'test',
        title: 'added'
      })

      expect(github.issues.updateMilestone).toHaveBeenCalledWith({
        owner: 'bkeepers',
        repo: 'test',
        title: 'new-description',
        description: 'modified-description',
        milestone_number: 2
      })

      expect(github.issues.updateMilestone).toHaveBeenCalledWith({
        owner: 'bkeepers',
        repo: 'test',
        title: 'new-state',
        state: 'closed',
        milestone_number: 4
      })

      expect(github.issues.deleteMilestone).toHaveBeenCalledTimes(1)
      expect(github.issues.updateMilestone).toHaveBeenCalledTimes(2)
      expect(github.issues.createMilestone).toHaveBeenCalledTimes(1)
    })
  })
})
