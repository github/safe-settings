const { performFullSync } = require('../../full-sync')

jest.mock('probot', () => ({
  createProbot: jest.fn()
}))
jest.mock('pino', () => jest.fn(() => ({ info: jest.fn() })))

describe('full-sync.js', () => {
  let mockApp

  beforeEach(() => {
    jest.clearAllMocks()
    require('probot').createProbot.mockImplementation(({ overrides }) => ({
      log: overrides.log
    }))
    mockApp = { syncInstallation: jest.fn() }
  })

  it('should pass logger to createProbot via overrides (v14 fix)', async () => {
    mockApp.syncInstallation.mockResolvedValue({ errors: [] })
    await performFullSync(jest.fn().mockReturnValue(mockApp), true)

    expect(require('probot').createProbot).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: expect.objectContaining({ log: expect.any(Object) })
      })
    )
  })

  it('should handle null settings without crashing (null safety)', async () => {
    mockApp.syncInstallation.mockResolvedValue(null)
    const mockLogger = { info: jest.fn(), error: jest.fn() }
    require('pino').mockReturnValueOnce(mockLogger)
    require('probot').createProbot.mockImplementationOnce(({ overrides }) => ({
      log: overrides.log
    }))
    await performFullSync(jest.fn().mockReturnValue(mockApp), true)

    expect(mockLogger.info).toHaveBeenCalledWith('Full sync completed successfully.')
  })
})
