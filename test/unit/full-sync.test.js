/* eslint-disable no-undef */
const { performFullSync } = require("../../full-sync");

jest.mock("probot", () => ({ createProbot: jest.fn() }));
jest.mock("pino", () => jest.fn(() => ({ info: jest.fn() })));

describe("full-sync.js", () => {
  let mockProbot, mockApp;

  beforeEach(() => {
    mockProbot = { log: { info: jest.fn() } };
    require("probot").createProbot.mockReturnValue(mockProbot);
    mockApp = { syncInstallation: jest.fn() };
    jest.clearAllMocks();
  });

  it("should pass logger to createProbot via overrides (v14 fix)", async () => {
    mockApp.syncInstallation.mockResolvedValue({ errors: [] });
    await performFullSync(jest.fn().mockReturnValue(mockApp), true);

    expect(require("probot").createProbot).toHaveBeenCalledWith(
      expect.objectContaining({
        overrides: expect.objectContaining({ log: expect.any(Object) }),
      }),
    );
  });

  it("should handle null settings without crashing (null safety)", async () => {
    mockApp.syncInstallation.mockResolvedValue(null);
    await performFullSync(jest.fn().mockReturnValue(mockApp), true);

    // Just verify it completes without throwing
    expect(mockProbot.log.info).toHaveBeenCalledWith(
      "Full sync completed successfully.",
    );
  });
});
