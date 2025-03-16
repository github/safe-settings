const Archive = require('../../../../lib/plugins/archive');
const NopCommand = require('../../../../lib/nopcommand');

describe('Archive Plugin', () => {
  let github;
  let log;
  let repo;
  let settings;
  let nop;

  beforeEach(() => {
    github = {
      repos: {
        get: jest.fn(),
        update: jest.fn()
      }
    };
    log = {
      debug: jest.fn(),
    };
    repo = { owner: 'test-owner', repo: 'test-repo' };
    settings = {};
    nop = false;
  });

  it('should return false if the repository is archived and settings.archived is true', async () => {
    github.repos.get.mockResolvedValue({ data: { archived: true } });
    settings.archived = true;

    const archive = new Archive(nop, github, repo, settings, log);
    const result = await archive.sync();

    expect(result.shouldContinue).toBe(false);
  });

  it('should return true if the repository is archived and settings.archived is false', async () => {
    github.repos.get.mockResolvedValue({ data: { archived: true } });
    settings.archived = false;

    const archive = new Archive(nop, github, repo, settings, log);
    const result = await archive.sync();

    expect(result.shouldContinue).toBe(true);
    expect(log.debug).toHaveBeenCalledWith('Unarchiving test-owner/test-repo');
  });

  it('should return false if the repository is not archived and settings.archived is true', async () => {
    github.repos.get.mockResolvedValue({ data: { archived: false } });
    settings.archived = true;

    const archive = new Archive(nop, github, repo, settings, log);
    const result = await archive.sync();

    expect(result.shouldContinue).toBe(false);
    expect(log.debug).toHaveBeenCalledWith('Archiving test-owner/test-repo');
  });

  it('should return true if the repository is not archived and settings.archived is false', async () => {
    github.repos.get.mockResolvedValue({ data: { archived: false } });
    settings.archived = false;

    const archive = new Archive(nop, github, repo, settings, log);
    const result = await archive.sync();

    expect(result.shouldContinue).toBe(true);
    expect(log.debug).toHaveBeenCalledWith('Repo test-owner/test-repo is not archived, ignoring.');
  });
});