const env = require('./env')
const { getInstallations } = require('./installationCache')

/**
 * Get authenticated octokit client for an org installation
 * @param {import('probot').Probot} robot
 * @param {string} orgName
 * @returns {Promise<import('@octokit/rest').Octokit|null>} Authenticated client or null
 */
async function getOrgInstallation (robot, orgName) {
  const installs = await getInstallations(robot)
  const install = installs.find(i => i.account && i.account.type === 'Organization' && i.account.login.toLowerCase() === orgName.toLowerCase())
  if (!install) {
    return null
  }
  return await robot.auth(install.id)
}

/**
 * Sync changed safe-settings organization files from the master admin PR
 * into the target organization's admin repository.
 * @param {import('probot').Probot} robot
 * @param {import('probot').Context} context
 * @param {string} orgName Destination organization login (also folder name under organizations/)
 * @param {string} destRepo Destination repo name inside orgName (e.g. admin repo)
 * @param {string} destinationFolder Base folder in destination repo where content lives (e.g. .github or .github/safe-settings)
 */
async function syncHubOrgUpdate (robot, context, orgName, destRepo, destinationFolder) {
  try {
    robot.log.info(`Syncing safe settings for organization: ${orgName}`)

    robot.log.info(`Organization: ${orgName}, Destination Repo: ${destRepo}, Destination Folder: ${destinationFolder}`)
    const pr = context.payload.pull_request
    if (!pr) {
      robot.log.warn('No pull_request payload found; aborting sync')
      return
    }
    const { owner: srcOwner, repo: srcRepo } = context.repo()
    const pull_number = pr.number

    // Source base path where org folders live inside master admin repo

    // 'safe-settings' is the standard sub-folder path
    const configRoot = env.CONFIG_PATH || '.github/'
    const sourceBase = (`${configRoot}/${env.SAFE_SETTINGS_HUB_PATH}/organizations`).replace(/\/$/, '')
    robot.log.info(`DEBUG: sourceBase='${sourceBase}'`)

    // Debug info: log env and computed paths
    robot.log.info(`DEBUG: env.CONFIG_PATH='${env.CONFIG_PATH}', env.SAFE_SETTINGS_HUB_PATH='${env.SAFE_SETTINGS_HUB_PATH}'`)

    // List changed files in PR
    const files = await context.octokit.paginate(
      context.octokit.rest.pulls.listFiles,
      { owner: srcOwner, repo: srcRepo, pull_number, per_page: 100 }
    )

    robot.log.info(`DEBUG: PR #${pull_number} contains ${files.length} changed file(s)`)
    if (files.length) robot.log.info(`DEBUG: files=${files.map(f => f.filename).join(', ')}`)

    // Dump file objects for debugging filename issues
    if (files.length) {
      try {
        robot.log.info(`DEBUG: first file object = ${JSON.stringify(files[0], null, 2)}`)
        robot.log.info(`DEBUG: file[0] keys = ${Object.keys(files[0] || {}).join(', ')}`)
      } catch (e) {
        robot.log.info(`DEBUG: failed to stringify first file: ${e.message}`)
      }
      files.forEach((f, i) => {
        try {
          robot.log.info(`DEBUG: FILE[${i}] raw=${JSON.stringify(f)}`)
          robot.log.info(`DEBUG: FILE[${i}] filename=${JSON.stringify(f.filename)} length=${(f.filename || '').length}`)
        } catch (e) {
          robot.log.info(`DEBUG: FILE[${i}] stringify error: ${e.message}`)
        }
      })
    }

    const orgPrefix = `${sourceBase}/${orgName}/`
    robot.log.info(`DEBUG: files=${files.map(f => f.filename).join(', ')}`)
    robot.log.info(`DEBUG: Path ${sourceBase}/${orgName}`)
    const relevant = files.filter(f => f.filename === `${sourceBase}/${orgName}` || f.filename.startsWith(orgPrefix))
    robot.log.info(`DEBUG: Found ${relevant.length} changed file(s) relevant to org ${orgName}`)
    if (!relevant.length) {
      robot.log.info(`No files for org ${orgName} in PR #${pull_number}`)
      // Detailed per-file checks to help debug matching
      files.forEach(f => {
        const exact = f.filename === `${sourceBase}/${orgName}`
        const pref = f.filename.startsWith(orgPrefix)
        robot.log.info(`MATCH CHECK: file='${f.filename}' exact=${exact} prefix=${pref}`)
      })
      // Also show alternate check using CONFIG_PATH + '/organizations'
      const altBase = `${(env.CONFIG_PATH || '.github').replace(/\/$/, '')}/organizations`
      const altPrefix = `${altBase}/${orgName}/`
      files.forEach(f => {
        const exactAlt = f.filename === `${altBase}/${orgName}`
        const prefAlt = f.filename.startsWith(altPrefix)
        robot.log.info(`ALT CHECK: file='${f.filename}' exactAlt=${exactAlt} prefAlt=${prefAlt}`)
      })
      return
    }

    // Destination info
    const destOwner = orgName
    // ensure destBase uses the configured CONFIG_PATH (fallback to '.github') and normalize trailing slash
    const destBase = (destinationFolder || env.CONFIG_PATH || '.github').replace(/\/$/, '')
    const destBaseBranch = 'main'
    const directPush = (env.SAFE_SETTINGS_HUB_DIRECT_PUSH === 'true' || env.SAFE_SETTINGS_HUB_DIRECT_PUSH === '1')

    // Find installation for destination org to auth (reusable helper)
    const githubDest = await getOrgInstallation(robot, destOwner)
    if (!githubDest) {
      robot.log.warn(`Installation for destination org ${destOwner} not found; cannot sync`)
      return
    }

    robot.log.info(`Syncing from ${srcOwner}/${srcRepo} PR #${pull_number} to ${destOwner}/${destRepo}@${destBaseBranch} under ${destBase} (directPush=${directPush})`)

    // Create branch if not direct push
    const timestamp = Date.now()
    const branchName = directPush ? destBaseBranch : `safe-settings-sync/pr-${pull_number}-${orgName}-${timestamp}`
    if (!directPush) {
      try {
        const baseRef = await githubDest.rest.git.getRef({ owner: destOwner, repo: destRepo, ref: `heads/${destBaseBranch}` })
        const baseSha = baseRef.data.object.sha
        await githubDest.rest.git.createRef({ owner: destOwner, repo: destRepo, ref: `refs/heads/${branchName}`, sha: baseSha })
        robot.log.info(`Created branch ${branchName} in ${destOwner}/${destRepo}`)
      } catch (err) {
        if (err.status === 422) {
          robot.log.warn(`Branch ${branchName} already exists, continuing`)
        } else {
          throw err
        }
      }
    }

    for (const f of relevant) {
      let relative
      if (f.filename === `${sourceBase}/${orgName}`) {
        // top directory marker encountered (unlikely in changed files list) - skip
        continue
      } else {
        relative = f.filename.slice(orgPrefix.length)
      }
      // place only the changed file under the configured CONFIG_PATH (e.g. '.github/<file>')
      const destPath = `${destBase}/${relative}`.replace(/\/+/g, '/')
      try {
        const srcContentResp = await context.octokit.rest.repos.getContent({ owner: srcOwner, repo: srcRepo, path: f.filename, ref: pr.head.sha })
        const data = srcContentResp.data
        if (Array.isArray(data)) {
          // Skip directories; individual files will appear separately in changed files list
          continue
        }
        const fileContent = Buffer.from(data.content, data.encoding).toString('utf8')
        const encoded = Buffer.from(fileContent, 'utf8').toString('base64')

        // Check existing file for sha
        let existingSha
        try {
          const destGet = await githubDest.rest.repos.getContent({ owner: destOwner, repo: destRepo, path: destPath, ref: destBaseBranch })
          if (!Array.isArray(destGet.data)) existingSha = destGet.data.sha
        } catch (getErr) {
          if (getErr.status !== 404) throw getErr // ignore missing
        }

        await githubDest.rest.repos.createOrUpdateFileContents({
          owner: destOwner,
          repo: destRepo,
          path: destPath,
          message: directPush ? `Direct sync safe-settings from ${srcOwner}/${srcRepo} PR #${pull_number}` : `Sync safe-settings from ${srcOwner}/${srcRepo} PR #${pull_number}`,
          content: encoded,
          branch: branchName,
          sha: existingSha,
          committer: { name: 'Safe Settings Bot', email: 'safe-settings-bot@example.com' },
          author: { name: 'Safe Settings Bot', email: 'safe-settings-bot@example.com' }
        })
        robot.log.info(`Committed ${destPath} to ${destOwner}/${destRepo}@${branchName}`)
      } catch (fileErr) {
        robot.log.error(`Failed to sync file ${f.filename}: ${fileErr.message}`)
        throw fileErr
      }
    }

    if (!directPush) {
      try {
        const prTitle = `Sync safe-settings from ${srcOwner}/${srcRepo} PR #${pull_number}`
        const prBody = `Automated sync of safe-settings for ${orgName} from ${srcOwner}/${srcRepo} PR #${pull_number}.`
        const created = await githubDest.rest.pulls.create({ owner: destOwner, repo: destRepo, title: prTitle, head: branchName, base: destBaseBranch, body: prBody })
        robot.log.info(`Created PR ${created.data.html_url} in ${destOwner}/${destRepo}`)
      } catch (prErr) {
        robot.log.error(`Failed to create PR in ${destOwner}/${destRepo}: ${prErr.message}`)
        throw prErr
      }
    } else {
      robot.log.info(`Changes pushed directly to ${destOwner}/${destRepo}@${destBaseBranch}`)
    }
  } catch (err) {
    robot.log.error(`syncSafeSettingConfig error for org ${orgName}: ${err.message}`)
  }
}

/**
 * Handle closed pull requests to sync safe-settings changes to target organizations.
 * Focus on the organization and repository specified in the pull request and if they belong to the Safe-Settings Hub.
 * @param {import('probot').Probot} robot
 * @param {import('probot').Context} context
 */
async function hubSyncHandler (robot, context) {
  const { payload } = context
  const { repository, pull_request } = payload || {}
  robot.log.info(`Received 'pull_request.closed' event: ${pull_request && pull_request.number}`)
  try {
    // Ensure the event is from the configured Safe-Settings Hub repo/org
    const isMasterRepo = repository && repository.name === env.SAFE_SETTINGS_HUB_REPO
    const isMasterOrg = repository && repository.owner && repository.owner.login === env.SAFE_SETTINGS_HUB_ORG

    if (!(isMasterRepo && isMasterOrg)) {
      robot.log.info(`Pull request.closed is not from master admin repo/org (${env.SAFE_SETTINGS_HUB_ORG}/${env.SAFE_SETTINGS_HUB_REPO}), ignoring`)
      return
    }

    robot.log.info(`Pull request closed on Safe-Settings Hub: (${repository.full_name})`)

    // Get the PR details
    const pr = pull_request
    const { owner, repo } = context.repo()
    const pull_number = pr.number

    // Paginate through all files changed in the PR
    const files = await context.octokit.paginate(
      context.octokit.rest.pulls.listFiles,
      { owner, repo, pull_number, per_page: 100 }
    )

    robot.log.info(`Files changed in PR #${pull_number}: ${files.map(f => f.filename).join(', ')}`)

    // Routing logic: check for 'globals' or 'organizations' folder changes
    const globalsChanged = files.some(f => /\/globals\//.test(f.filename))
    const orgsChanged = files.some(f => /\/organizations\//.test(f.filename))

    if (globalsChanged) {
      robot.log.info('Detected changes in the globals folder. Routing to syncHubGlobalsUpdate(...).')
      await module.exports.syncHubGlobalsUpdate(robot, context, files)
    }

    if (orgsChanged) {
      robot.log.info('Detected changes in the organizations folder. Routing to syncHubOrgUpdate(...).')
      // Only sync updates in organization subfolders, not files directly in organizations folder
      const baseSettingsPath = `${(env.CONFIG_PATH || '.github').replace(/\/$/, '')}/${env.SAFE_SETTINGS_HUB_PATH}/organizations`
      const normalizedBase = baseSettingsPath.replace(/\/$/, '')
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Only match files in org subfolders: .../organizations/<org>/...
      const orgSubfolderPattern = new RegExp(`^${escapeRegex(normalizedBase)}/([^/]+)/.+`)
      const orgNamesSet = new Set()
      files.forEach(f => {
        const m = f.filename.match(orgSubfolderPattern)
        if (m && m[1]) {
          orgNamesSet.add(m[1])
        }
      })
      const orgNames = Array.from(orgNamesSet)
      robot.log.info(`Orgs updated in PR #${pull_number}: ${orgNames.join(', ')}`)
      for (const orgName of orgNames) {
        const destRepo = env.ADMIN_REPO
        const destinationFolder = env.CONFIG_PATH || '.github'
        await module.exports.syncHubOrgUpdate(robot, context, orgName, destRepo, destinationFolder)
      }
    }
  } catch (err) {
    robot.log.error(`Failed to sync safe settings: ${err && err.message ? err.message : err}`)
  }
}

/**
 * Handle updates in the globals folder and sync to destinations defined in manifest.yml rules
 * @param {import('probot').Probot} robot
 * @param {import('probot').Context} context
 * @param {Array<Object>} files - Array of changed file objects from PR
 */
async function syncHubGlobalsUpdate (robot, context, files) {
  robot.log.info('syncHubGlobalsUpdate: Processing globals folder changes.')
  // Step 1: Load manifest.yml rules from the hub repo
  const yaml = require('js-yaml')
  const util = require('util')
  const manifestPath = `${env.CONFIG_PATH}/${env.SAFE_SETTINGS_HUB_PATH}/globals/manifest.yml`
  let manifest
  try {
    // Get manifest.yml from the hub repo (default branch: main)
    const resp = await context.octokit.repos.getContent({
      owner: env.SAFE_SETTINGS_HUB_ORG,
      repo: env.SAFE_SETTINGS_HUB_REPO,
      path: manifestPath,
      ref: 'main'
    })

    const manifestContent = Buffer.from(resp.data.content, resp.data.encoding).toString('utf8')
    manifest = yaml.load(manifestContent)
    robot.log.info('Loaded manifest.yml rules from hub repo:' + JSON.stringify(manifest, null, 2))
  } catch (err) {
    robot.log.error('Failed to load manifest.yml from hub repo:' + err.message)
    return
  }
  // Step 2: Determine which update to sync where
  // Find changed files in the globals folder
  const changedGlobals = files.filter(f => /\/globals\//.test(f.filename))
  if (!changedGlobals.length) {
    robot.log.info('No changed files in globals folder.')
    return
  }

  // For each changed file, match against manifest rules
  for (const fileObj of changedGlobals) {
    const fileName = fileObj.filename.split('/').pop()
    // Prevent manifest.yml from being synced to organizations
    if (fileName === 'manifest.yml') {
      robot.log.info(`Skipping sync for manifest.yml (should only exist in hub)`)
      continue
    }
    robot.log.info(`Evaluating globals file: ${fileObj.filename}`)
    for (const rule of manifest.rules || []) {
      // Check if file matches rule.files (glob match, simple * and exact)
      const matchesFile = (rule.files || []).some(pattern => {
        if (pattern === fileName) return true
        if (pattern.startsWith('*') && fileName.endsWith(pattern.slice(1))) return true
        if (pattern.endsWith('*') && fileName.startsWith(pattern.slice(0, -1))) return true
        if (pattern.includes('*')) {
          // Simple contains match for *
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
          return regex.test(fileName)
        }
        return false
      })
      if (!matchesFile) continue

      // Determine target orgs
      const targets = rule.targets || []
      robot.log.info(`Rule '${rule.name}' matches file '${fileName}'. Targets: ${targets.join(', ')}`)
      // Step 3: handle mergeStrategy and actual sync
      const mergeStrategy = rule.mergeStrategy || 'merge'
      for (const orgPattern of targets) {
        // For demo, treat '*' as all orgs, otherwise match orgs by pattern
        let orgsToSync = []
        if (orgPattern === '*') {
          // Get all org installations
          const installs = await getInstallations(robot)
          orgsToSync = installs.filter(i => i.account && i.account.type === 'Organization').map(i => i.account.login)
        } else if (orgPattern.endsWith('*')) {
          // Prefix match
          const prefix = orgPattern.slice(0, -1)
          const installs = await getInstallations(robot)
          orgsToSync = installs.filter(i => i.account && i.account.type === 'Organization' && i.account.login.startsWith(prefix)).map(i => i.account.login)
        } else {
          orgsToSync = [orgPattern]
        }
        for (const orgName of orgsToSync) {
          robot.log.info(`Preparing to sync file '${fileName}' to org '${orgName}' with mergeStrategy='${mergeStrategy}'`)
          // Check if org has a safe-settings config repo (repo exists)
          const destRepo = env.ADMIN_REPO
          // use the octokit client authenticated for the hub installation
          const githubDest = await getOrgInstallation(robot, orgName)
          if (!githubDest) {
            robot.log.info(`Skipping org ${orgName}: no installation found.`)
            continue
          }
          let repoExists = false
          try {
            await githubDest.repos.get({ owner: orgName, repo: destRepo })
            repoExists = true
          } catch (err) {
            if (err.status === 404) {
              robot.log.info(`Skipping org ${orgName}: config repo '${destRepo}' does not exist.`)
              continue
            } else {
              throw err
            }
          }
          if (!repoExists) continue
          // Check if file exists in org's repo
          const destPath = `${env.CONFIG_PATH}/${fileName}`
          let exists = false
          let existingContent = null
          try {
            robot.log.info(`Checking existence of ${destPath} in ${orgName}/${destRepo}`)
            const resp = await githubDest.repos.getContent({
              owner: orgName,
              repo: destRepo,
              path: destPath,
              ref: 'main'
            })
            if (!Array.isArray(resp.data)) {
              robot.log.info(`Found ${destPath} in ${orgName}/${destRepo}`)
              exists = true
              existingContent = Buffer.from(resp.data.content, resp.data.encoding).toString('utf8')
            }
          } catch (err) {
            if (err.status === 404) {
              robot.log.info(`File ${destPath} not found in ${orgName}/${destRepo} (this is fine for both merge strategies)`)
              exists = false
              existingContent = null
            } else {
              robot.log.info(`Error checking ${destPath} in ${orgName}/${destRepo}: ${err.message}`)
              throw err
            }
          }
          // Merge strategy logic
          if (mergeStrategy === 'merge' && exists) {
            robot.log.info(`Skipping sync of ${fileName} to ${orgName} (already exists & mergeStrategy=${mergeStrategy})`)
            continue
          }
          // For overwrite or merge with no existing file, sync
          robot.log.info(`Syncing ${fileName} to ${orgName} (mergeStrategy=${mergeStrategy})`)
          // Actual sync logic: create or update file in org repo
          try {
            // Get source file content from hub repo (use PR head SHA if available, else main)
            let srcContentResp
            const pr = context.payload && context.payload.pull_request
            const srcRef = pr && pr.head && pr.head.sha ? pr.head.sha : 'main'
            srcContentResp = await context.octokit.repos.getContent({
              owner: env.SAFE_SETTINGS_HUB_ORG,
              repo: env.SAFE_SETTINGS_HUB_REPO,
              path: fileObj.filename,
              ref: srcRef
            })
            const data = srcContentResp.data
            if (Array.isArray(data)) {
              robot.log.info(`Skipping directory ${fileObj.filename}`)
              continue
            }
            const fileContent = Buffer.from(data.content, data.encoding).toString('utf8')
            const encoded = Buffer.from(fileContent, 'utf8').toString('base64')

            // Prepare commit message and branch
            const destBaseBranch = 'main'
            const directPush = (env.SAFE_SETTINGS_HUB_DIRECT_PUSH === 'true' || env.SAFE_SETTINGS_HUB_DIRECT_PUSH === '1')
            const timestamp = Date.now()
            const branchName = directPush ? destBaseBranch : `safe-settings-globals-sync/${orgName}-${fileName}-${timestamp}`

            // Create branch if not direct push
            if (!directPush) {
              try {
                const baseRef = await githubDest.rest.git.getRef({ owner: orgName, repo: destRepo, ref: `heads/${destBaseBranch}` })
                const baseSha = baseRef.data.object.sha
                await githubDest.rest.git.createRef({ owner: orgName, repo: destRepo, ref: `refs/heads/${branchName}`, sha: baseSha })
                robot.log.info(`Created branch ${branchName} in ${orgName}/${destRepo}`)
              } catch (err) {
                if (err.status === 422) {
                  robot.log.warn(`Branch ${branchName} already exists, continuing`)
                } else {
                  throw err
                }
              }
            }

            // Create or update file
            await githubDest.rest.repos.createOrUpdateFileContents({
              owner: orgName,
              repo: destRepo,
              path: destPath,
              message: directPush ? `Direct sync globals file '${fileName}' from hub` : `Sync globals file '${fileName}' from hub`,
              content: encoded,
              branch: branchName,
              sha: exists ? (await githubDest.repos.getContent({ owner: orgName, repo: destRepo, path: destPath, ref: branchName })).data.sha : undefined,
              committer: { name: 'Safe Settings Bot', email: 'safe-settings-bot@example.com' },
              author: { name: 'Safe Settings Bot', email: 'safe-settings-bot@example.com' }
            })
            robot.log.info(`Committed ${destPath} to ${orgName}/${destRepo}@${branchName}`)

            // Create PR if not direct push
            if (!directPush) {
              try {
                const prTitle = `Sync globals file '${fileName}' from hub`
                const prBody = `Automated sync of globals file '${fileName}' from hub to ${orgName}.`
                const created = await githubDest.rest.pulls.create({ owner: orgName, repo: destRepo, title: prTitle, head: branchName, base: destBaseBranch, body: prBody })
                robot.log.info(`Created PR ${created.data.html_url} in ${orgName}/${destRepo}`)
              } catch (prErr) {
                robot.log.error(`Failed to create PR in ${orgName}/${destRepo}: ${prErr.message}`)
                throw prErr
              }
            } else {
              robot.log.info(`Changes pushed directly to ${orgName}/${destRepo}@${destBaseBranch}`)
            }
          } catch (syncErr) {
            robot.log.error(`Failed to sync globals file ${fileName} to ${orgName}: ${syncErr.message}`)
          }
        }
      }
    }
  }
}

/**
 * Retrieve settings files from remote organization admin repositories,
 * commit them into a branch in the hub repository, and open a pull request.
 * @param {import('probot').Probot} robot
 * @param {Array<string>} orgNames Array of organization names to retrieve settings from
 * @param {Object} options Options for the operation
 * @param {string} options.baseBranch Base branch to create new branches from (default: 'main')
 * @returns {Promise<Array<Object>>} Results of the operation for each organization
 */
async function retrieveSettingsFromOrgs (robot, orgNames = [], options = {}) {
  const path = require('path')
  const results = []
  try {
    if (!Array.isArray(orgNames) || orgNames.length === 0) return results

    const installs = await getInstallations(robot)

    const hubOwnerLogin = (env.SAFE_SETTINGS_HUB_ORG || '').toLowerCase()
    const hubRepoName = env.SAFE_SETTINGS_HUB_REPO
    if (!hubOwnerLogin || !hubRepoName) {
      throw new Error('SAFE_SETTINGS_HUB_ORG and SAFE_SETTINGS_HUB_REPO must be configured')
    }

    const hubInstall = installs.find(i => i.account && i.account.login && i.account.login.toLowerCase() === hubOwnerLogin)
    if (!hubInstall) throw new Error(`Installation for hub org ${env.SAFE_SETTINGS_HUB_ORG} not found`)

    const githubHub = await robot.auth(hubInstall.id)
    const baseBranch = options.baseBranch || 'main'

    // Resolve the base sha for creating branches
    const baseRef = await githubHub.rest.git.getRef({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, ref: `heads/${baseBranch}` })
    const baseSha = baseRef.data && baseRef.data.object && baseRef.data.object.sha

    // Helper: collect all files under a path in a repo (recursively)
    async function collectFilesFromRepo (githubClient, owner, repo, dirPath, ref = 'main') {
      const out = []
      async function walk (p) {
        try {
          const resp = await githubClient.repos.getContent({ owner, repo, path: p, ref })
          const data = resp.data
          if (Array.isArray(data)) {
            for (const item of data) {
              if (item.type === 'file') {
                try {
                  const fileResp = await githubClient.repos.getContent({ owner, repo, path: item.path, ref })
                  if (!Array.isArray(fileResp.data) && typeof fileResp.data.content === 'string') {
                    const decoded = Buffer.from(fileResp.data.content, fileResp.data.encoding || 'base64').toString('utf8')
                    out.push({ path: fileResp.data.path, content: decoded })
                  }
                } catch (fe) {
                  // skip unreadable files, but log
                  robot.log && robot.log.warn && robot.log.warn(`collectFilesFromRepo: failed to fetch ${item.path} from ${owner}/${repo}: ${fe.message}`)
                }
              } else if (item.type === 'dir') {
                await walk(item.path)
              } else {
                // skip other types (submodules, symlinks)
                robot.log && robot.log.debug && robot.log.debug(`Skipping unsupported item type ${item.type} at ${item.path}`)
              }
            }
          } else if (typeof data.content === 'string') {
            const decoded = Buffer.from(data.content, data.encoding || 'base64').toString('utf8')
            out.push({ path: data.path, content: decoded })
          }
        } catch (e) {
          if (e && e.status === 404) {
            // path does not exist on repo -> no files
            return
          }
          throw e
        }
      }
      await walk(dirPath)
      return out
    }

    // Iterate requested orgs and import their CONFIG_PATH into the hub repo under the organizations/<org> tree
    for (const orgName of orgNames) {
      try {
        if (!orgName) { results.push({ org: orgName, error: 'invalid org name' }); continue }
        robot.log.info(`Retrieving settings from org: ${orgName}`)

        // fast existence check on the hub repo: skip if org folder already exists under CONFIG_PATH/SAFE_SETTINGS_HUB_PATH/organizations
        try {
          const destOrgPath = `${(env.CONFIG_PATH || '.github').replace(/\/$/, '')}/${env.SAFE_SETTINGS_HUB_PATH}/organizations/${orgName}`
          try {
            const destCheck = await githubHub.rest.repos.getContent({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, path: destOrgPath, ref: baseBranch })
            if (Array.isArray(destCheck.data) && destCheck.data.length > 0) {
              robot.log.info(`Skipping ${orgName}: already present in hub`)
              results.push({ org: orgName, skipped: true, reason: 'already_imported' })
              continue
            }
          } catch (probeErr) {
            if (!(probeErr && probeErr.status === 404)) {
              robot.log && robot.log.warn && robot.log.warn(`Failed to probe hub destination for ${orgName}: ${probeErr.message}`)
              results.push({ org: orgName, error: `failed to check destination: ${probeErr.message}` })
              continue
            }
            // 404 -> not present, proceed
          }
        } catch (e) {
          robot.log && robot.log.warn && robot.log.warn(`Unexpected error while probing destination for ${orgName}: ${e.message}`)
          results.push({ org: orgName, error: `probe error: ${e.message}` })
          continue
        }

        const srcInstall = installs.find(i => i.account && i.account.login && i.account.login.toLowerCase() === orgName.toLowerCase())
        if (!srcInstall) {
          results.push({ org: orgName, error: 'installation not found for org' })
          continue
        }

        const githubSrc = await robot.auth(srcInstall.id)
        const adminRepo = env.ADMIN_REPO
        if (!adminRepo) {
          results.push({ org: orgName, error: 'ADMIN_REPO is not configured' })
          continue
        }

        const sourceBase = (env.CONFIG_PATH || '.github').replace(/\/$/, '')
        // collect files from the source admin repo under CONFIG_PATH
        const files = await collectFilesFromRepo(githubSrc, orgName, adminRepo, sourceBase, 'main')

        if (!files || files.length === 0) {
          results.push({ org: orgName, info: 'no files found at CONFIG_PATH' })
          continue
        }

        const timestamp = Date.now()
        const branchName = `safe-settings-import/${orgName}/${timestamp}`.replace(/[^a-zA-Z0-9_\-./]/g, '-')

        // create branch in hub repo
        try {
          await githubHub.rest.git.createRef({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, ref: `refs/heads/${branchName}`, sha: baseSha })
        } catch (createErr) {
          if (createErr && createErr.status === 422) {
            robot.log.info(`Branch ${branchName} already exists, continuing`) // continue
          } else {
            throw createErr
          }
        }

        // Instead of creating/updating files one-by-one, build a single tree and commit so the PR contains all files atomically
        try {
          const treeEntries = []
          for (const f of files) {
            // relative path under the sourceBase
            const rel = path.posix.relative(sourceBase, f.path)
            // Destination should be: CONFIG_PATH/SAFE_SETTINGS_HUB_PATH/organizations/<orgName>/<relative>
            const destBase = `${(env.CONFIG_PATH || '.github').replace(/\/$/, '')}/${env.SAFE_SETTINGS_HUB_PATH}`
            const destPath = path.posix.join(destBase, 'organizations', orgName, rel).replace(/\/+/g, '/')
            treeEntries.push({ path: destPath, mode: '100644', type: 'blob', content: f.content })
          }

          // Get base commit and tree
          const baseCommitResp = await githubHub.rest.git.getCommit({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, commit_sha: baseSha })
          const baseTreeSha = baseCommitResp.data && baseCommitResp.data.tree && baseCommitResp.data.tree.sha

          // Create a new tree rooted at the base tree
          const createdTree = await githubHub.rest.git.createTree({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, tree: treeEntries, base_tree: baseTreeSha })

          // Create a commit that points to the new tree
          const commitMessage = `Import safe-settings from ${orgName}`
          const newCommit = await githubHub.rest.git.createCommit({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, message: commitMessage, tree: createdTree.data.sha, parents: [baseSha] })

          // Update the branch ref to point to the new commit
          await githubHub.rest.git.updateRef({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, ref: `heads/${branchName}`, sha: newCommit.data.sha })

          robot.log.info(`Created commit ${newCommit.data.sha} on ${env.SAFE_SETTINGS_HUB_ORG}/${hubRepoName}@${branchName} with ${treeEntries.length} files`)
        } catch (commitErr) {
          robot.log.error(`Failed to create commit tree for ${orgName}: ${commitErr && commitErr.message ? commitErr.message : commitErr}`)
          results.push({ org: orgName, error: `failed to commit files: ${commitErr && commitErr.message ? commitErr.message : String(commitErr)}` })
          continue
        }

        // Create a PR in the hub repo for this branch
        try {
          const prTitle = `Import safe-settings from ${orgName}`
          const prBody = `Automated import of settings from ${orgName} admin repo (${adminRepo}) into the hub.`
          const created = await githubHub.rest.pulls.create({ owner: env.SAFE_SETTINGS_HUB_ORG, repo: hubRepoName, title: prTitle, head: branchName, base: baseBranch, body: prBody })
          results.push({ org: orgName, pr: created.data && created.data.html_url })
          robot.log.info(`Created PR ${created.data && created.data.html_url} for ${orgName}`)
        } catch (prErr) {
          robot.log.error(`Failed to create PR for ${orgName}: ${prErr && prErr.message ? prErr.message : prErr}`)
          results.push({ org: orgName, error: `failed to create PR: ${prErr && prErr.message ? prErr.message : String(prErr)}` })
        }
      } catch (errInner) {
        robot.log.error(`Error importing settings for org ${orgName}: ${errInner && errInner.message ? errInner.message : errInner}`)
        results.push({ org: orgName, error: errInner && errInner.message ? errInner.message : String(errInner) })
      }
    }

    return results
  } catch (err) {
    robot.log.error(`retrieveSettingsFromOrgs error: ${err && err.message ? err.message : err}`)
    throw err
  }
}

// Export all internal functions for testability
module.exports = {
  hubSyncHandler,
  retrieveSettingsFromOrgs,
  syncHubOrgUpdate,
  syncHubGlobalsUpdate,
  getOrgInstallation
}
