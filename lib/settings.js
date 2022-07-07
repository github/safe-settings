const path = require('path')
const fs = require('fs')
const Glob = require('./glob')
const NopCommand = require('./nopcommand')
const { throws } = require('assert')
class Settings {

  static async syncAll(nop, context, repo, config, ref) {
    const settings = new Settings(nop, context, repo, config, ref)
    await settings.loadConfigs()
    await settings.updateAll()
    await settings.handleResults()
  }

  static async sync(nop, context, repo, config, ref) {
    const { payload } = context
    const settings = new Settings(nop, context, repo, config, ref)
    await settings.loadConfigs()
    if(settings.isRestricted(repo.repo)) {
      return;
    }
    await settings.updateRepos(repo)
    await settings.handleResults()
  }

  static async handleError(nop, context, repo, config, ref, nopcommand ) {
    const { payload } = context
    const settings = new Settings(nop, context, repo, config, ref)
    settings.appendToResults([nopcommand])
    await settings.handleResults()
  }

  constructor(nop, context, repo, config, ref) {
    this.ref = ref
    this.context = context
    this.installation_id = context.payload.installation.id
    this.github = context.octokit
    this.repo = repo
    this.config = config
    this.nop = nop
    this.log = context.log
    this.results = []
    this.configvalidators = {}
    this.overridevalidators = {}
    const overridevalidators = config.overridevalidators
    if (this.isIterable(overridevalidators)) {
      for (const validator of overridevalidators) {
        const f = new Function("baseconfig", "overrideconfig", validator.script)
        this.overridevalidators[validator.plugin] = { canOverride: f, error: validator.error }
      }
    }
    const configvalidators = config.configvalidators
    if (this.isIterable(configvalidators)) {
      for (const validator of configvalidators) {
        const f = new Function("baseconfig", validator.script)
        this.configvalidators[validator.plugin] = { isValid: f, error: validator.error }
      }
    }
  }

  async handleResults() {
    const { payload } = this.context
    if (!this.nop) {
      this.log.debug(`Not run in nop`)
      return
    }
    let error = false;
    const pull_request = payload.check_run.check_suite.pull_requests[0]
    const commentmessage = `
## Safe-Settings Validator summary
### :robot: Please expand to see the details:
${this.results.reduce((x,y) => {
  if (!y) {
    return x
  }
  if (y.endpoint) {
    return `${x}
<details>
  <summary>✅ ${y.plugin} plugin will perform \`${y.action}\` using this API ${y.endpoint}</summary>
  The payload is:
  ${JSON.stringify(y.body, null, 4)}
</details>`
  } else {
    if (y.type === "ERROR") {
      error = true
      return `${x}
<details>
  <summary>❌ ${y.plugin} : ${y.action}</summary>
</details>`
    } else {
      return `${x}
<details>
  <summary>ℹ️ ${y.plugin} : ${y.repo} : ${y.action}</summary>
</details>`
    }
  }

}, '')}
`
/*
    const newIssueComment = await
        this.github.issues.createComment({
          owner: payload.repository.owner.login,
          repo: payload.repository.name,
          issue_number: pull_request.number,
          body: commentmessage
        })
*/
    const params = {
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      check_run_id: payload.check_run.id,
      status: 'completed',
      conclusion: error?'failure':'success',
      completed_at: new Date().toISOString(),
      output: {
        title: error?"Finished with error":"Finished with success",
        summary: commentmessage
      },
    }

    this.log.debug(`Completing check run ${JSON.stringify(params)}`)
    await this.github.checks.update(params)

  }

  async loadConfigs() {
    this.repoConfigs = await this.getRepoConfigs(this.github, this.repo, this.log)
    this.subOrgConfigs = await this.getSubOrgConfigs(this.github, this.repo, this.log)
  }

  async updateRepos(repo) {
    this.subOrgConfigs = this.subOrgConfigs || await this.getSubOrgConfigs(this.github, repo, this.log)
    this.repoConfigs = this.repoConfigs || await this.getRepoConfigs(this.github, repo, this.log)
    let repoConfig = this.config.repository
    if (repoConfig) {
      repoConfig = Object.assign(repoConfig, {name: repo.repo, org: repo.owner})
    }

    const subOrgConfig = this.getSubOrgConfig(repo.repo)

    if (subOrgConfig) {
      let suborgRepoConfig = subOrgConfig.repository
      if (suborgRepoConfig) {
        suborgRepoConfig = Object.assign(suborgRepoConfig, {name: repo.repo, org: repo.owner})
        repoConfig = this.mergeDeep({}, repoConfig, suborgRepoConfig)
      }
    }

    // Overlay repo config
    const overrideRepoConfig = this.repoConfigs[`${repo.repo}.yml`]?.repository
    if (overrideRepoConfig) {
      repoConfig = this.mergeDeep({}, repoConfig, overrideRepoConfig)
    }
    if (repoConfig) {
      try {
        this.log.debug(`found a matching repoconfig for this repo ${JSON.stringify(repoConfig)}`)
        const childPlugins = this.childPluginsList(repo.repo)
        const RepoPlugin = Settings.PLUGINS.repository
        return new RepoPlugin(this.nop, this.github, repo, repoConfig, this.installation_id, this.log).sync().then( res => {
          this.appendToResults(res)
          return Promise.all(
            childPlugins.map(([Plugin, config]) => {
              return new Plugin(this.nop, this.github, repo, config, this.log).sync()
            }))
          }).then( res => {
            this.appendToResults(res)
          })
      } catch(e) {
        if (this.nop) {
          const nopcommand = new NopCommand(this.constructor.name, this.repo, null,e, "ERROR")
          console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
          this.appendToResults([nopcommand])
          //throw e
        } else {
          throw e
        }
      }

    } else {
      this.log.debug(`Didnt find any a matching repoconfig for this repo ${JSON.stringify(repo)} in ${JSON.stringify(this.repoConfigs)}`)
      const childPlugins = this.childPluginsList(repo.repo)
      return Promise.all(childPlugins.map(([Plugin, config]) => {
        return new Plugin(this.nop, this.github, repo, config, this.log).sync().then( res => {
           this.appendToResults(res)
         })
      }))
    }
  }

  async updateAll() {
    this.subOrgConfigs = this.subOrgConfigs || await this.getSubOrgConfigs(this.github, this.repo, this.log)
    this.repoConfigs = this.repoConfigs || await this.getRepoConfigs(this.github, this.repo, this.log)
    return this.eachRepositoryRepos(this.github, this.config.restrictedRepos, this.log).then( res => {
      this.appendToResults(res)
    })
  }

  getSubOrgConfig(repoName) {
    for (let k of Object.keys(this.subOrgConfigs)) {
      const repoPattern = new Glob(k)
      if (repoName.search(repoPattern)>=0) {
        return this.subOrgConfigs[k]
      }
    }
    return undefined
  }

  childPluginsList(repoName) {
    // Overlay with subOrgConfig
    const subOrgConfig = this.getSubOrgConfig(repoName)
    this.log.debug(`suborg config for ${repoName}  is ${JSON.stringify(subOrgConfig)}`)
    let newConfig = this.mergeDeep({}, this.config, subOrgConfig)
    this.log.debug(`new config  is ${JSON.stringify(newConfig)}`)

    const overrideRepoConfig = this.repoConfigs[`${repoName}.yml`]
    if (overrideRepoConfig) {
      newConfig = this.mergeDeep({}, newConfig, overrideRepoConfig)
    }
    this.log.debug(`consolidated config is ${JSON.stringify(newConfig)}`)
    const childPlugins = []
    for (const [section, config] of Object.entries(newConfig)) {
      if (section !== 'repositories' && section !== 'repository') {
        // Ignore any config that is not a plugin
        if (section in Settings.PLUGINS) {
          this.log.debug(`Found section ${section} in the config. Creating plugin...`)
          const Plugin = Settings.PLUGINS[section]
          childPlugins.push([Plugin, config])
        }
      }
    }
    return childPlugins
  }

  isRestricted(repoName) {
    const restrictedRepos = this.config.restrictedRepos
    // Skip configuring any restricted repos
    if (Array.isArray(restrictedRepos)) {
      // For backward compatibility support the old format
      if (restrictedRepos.includes(repoName)) {
        this.log.debug(`Skipping retricted repo ${repoName}`)
        return true
      } else {
        this.log.debug(`${repoName} not in restricted repos ${restrictedRepos}`)
        return false
      }
    } else if (Array.isArray(restrictedRepos.include)) {
      if (restrictedRepos.include.includes(repoName)) {
        this.log.debug(`Allowing ${repoName} in restrictedRepos.include [${restrictedRepos.include}]`)
        return false
      } else {
        this.log.debug(`Skipping repo ${repoName} not in restrictedRepos.include`)
        return true
      }
    } else if (Array.isArray(restrictedRepos.exclude)) {
      if (restrictedRepos.exclude.includes(repoName)) {
        this.log.debug(`Skipping excluded repo ${repoName} in restrictedRepos.exclude`)
        return true
      } else {
        this.log.debug(`Allowing ${repoName} not in restrictedRepos.exclude [${restrictedRepos.exclude}]`)
        return false
      }
    }
    return false
  }

  async eachRepositoryChildPlugins(github, restrictedRepos, log) {
    log.debug('Fetching repositories')
    return github.paginate('GET /installation/repositories').then(repositories => {
      return Promise.all(repositories.map(repository => {
        if (this.isRestricted(repository.name)) {
          return
        }
        const { owner, name } = repository
        const childPlugins = this.childPluginsList(name)
        return Promise.all(
          childPlugins.map(
            ([Plugin, config]) => { return new Plugin(this.nop, github, { owner: owner.login, repo: name }, config, log).sync() }
          )
        ).then( res => {
          return res
        })
      })
      )
    })
  }

  async eachRepositoryRepos(github, restrictedRepos, log) {
    log.debug('Fetching repositories')
    return github.paginate('GET /installation/repositories').then(repositories => {
      return Promise.all(repositories.map(repository => {
        if (this.isRestricted(repository.name)) {
          return
        }

        const { owner, name } = repository
        return this.updateRepos({ owner: owner.login, repo: name })
      })
      )
    })
  }

  /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async loadConfigMap(params) {
    try {
      this.log.debug(` In loadConfigMap ${JSON.stringify(params)}`)
      const response = await this.github.repos.getContent(params).catch(e => {
        this.log.debug(`Error getting settings ${JSON.stringify(params)} ${e}`)
      })

      if (!response) {
        return []
      }
      // Ignore in case path is a folder
      // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-directory
      if (Array.isArray(response.data)) {
        //const overrides = new Map()
        const overrides = response.data.map(d => { return { name: d.name, path: d.path } })
        //response.data.forEach(d =>  overrides.set(d.name, d.path))
        return overrides
      }
      // we don't handle symlinks or submodule
      // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-symlink
      // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-submodule
      if (typeof response.data.content !== 'string') {
        return
      }
      const yaml = require('js-yaml')
      return yaml.load(Buffer.from(response.data.content, 'base64').toString()) || {}
    } catch (e) {
      if (e.status === 404) {
        return null
      }
      if (this.nop) {
        const nopcommand = new NopCommand("settings", this.repo, null,e, "ERROR")
        console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        this.appendToResults([nopcommand])
        //throw e
      } else {
        throw e
      }
    }
  }

  /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async getRepoConfigMap() {
    try {
      this.log.debug(` In getRepoConfigMap ${JSON.stringify(this.repo)}`)
      const repo = { owner: this.repo.owner, repo: 'admin' }
      const CONFIG_PATH = '.github'
      const params = Object.assign(repo, { path: path.posix.join(CONFIG_PATH, 'repos'), ref: this.ref })

      const response = await this.loadConfigMap(params)
      return response
    } catch (e) {
      if (this.nop) {
        const nopcommand = new NopCommand("getRepoConfigMap", this.repo, null,e, "ERROR")
        console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        this.appendToResults([nopcommand])
        //throw e
      } else {
        throw e
      }
    }
  }

    /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async getSubOrgConfigMap() {
    try {
      this.log.debug(` In getRepoConfigMap ${JSON.stringify(this.repo)}`)
      const repo = { owner: this.repo.owner, repo: 'admin' }
      const CONFIG_PATH = '.github'
      const params = Object.assign(repo, { path: path.posix.join(CONFIG_PATH, 'suborgs'), ref: this.ref })

      const response = await this.loadConfigMap(params)
      return response
    } catch (e) {
      if (this.nop) {
        const nopcommand = new NopCommand("getSubOrgConfigMap", this.repo, null,e, "ERROR")
        console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        this.appendToResults([nopcommand])
        //throw e
      } else {
        throw e
      }
    }
  }

  /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async getRepoConfigs() {
    try {
      const overridePaths = await this.getRepoConfigMap()
      const repoConfigs = {}

      for (let override of overridePaths) {
        const data = await this.loadYaml(override.path)
        this.log.debug(`data = ${JSON.stringify(data)}`)
        repoConfigs[override.name] = data
      }
      this.log.debug(`repo configs = ${JSON.stringify(repoConfigs)}`)
      return repoConfigs
    } catch (e) {
      if (this.nop) {
        const nopcommand = new NopCommand("getRepoConfigs", this.repo, null,e, "ERROR")
        console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        this.appendToResults([nopcommand])
        //throw e
      } else {
        throw e
      }
    }
  }

  /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async getSubOrgConfigs() {
    try {
      const overridePaths = await this.getSubOrgConfigMap()
      const subOrgConfigs = {}

      for (let override of overridePaths) {
        const data = await this.loadYaml(override.path)
        this.log.debug(`data = ${JSON.stringify(data)}`)

        if (!data) {return subOrgConfigs}

        subOrgConfigs[override.name] = data
        if (data.suborgrepos) {
          data.suborgrepos.forEach(repository => {
            subOrgConfigs[repository]=data
          })
        }
        if (data.suborgteams) {
          const promises = data.suborgteams.map(  (teamslug) => {
            return this.getReposForTeam(teamslug)
          })
          await Promise.all(promises).then(res => {
            res.forEach(r => {
              r.forEach(e => {
                subOrgConfigs[e.name]=data
              })
            })
          })
        }
      }
      return subOrgConfigs
    } catch (e) {
      if (this.nop) {
        const nopcommand = new NopCommand("getSubOrgConfigs", this.repo, null,e, "ERROR")
        console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        this.appendToResults([nopcommand])
        //throw e
      } else {
        throw e
      }
    }
  }
  /**
   * Loads a file from GitHub
   *
   * @param params Params to fetch the file with
   * @return The parsed YAML file
   */
  async loadYaml(filePath) {
    try {
      const repo = { owner: this.repo.owner, repo: 'admin' }
      const params = Object.assign(repo, { path: filePath, ref: this.ref })
      const response = await this.github.repos.getContent(params).catch(e => {
        this.log.error(`Error getting settings ${e}`)
      })

      // Ignore in case path is a folder
      // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-directory
      if (Array.isArray(response.data)) {
        return null
      }

      // we don't handle symlinks or submodule
      // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-symlink
      // - https://developer.github.com/v3/repos/contents/#response-if-content-is-a-submodule
      if (typeof response.data.content !== 'string') {
        return
      }
      const yaml = require('js-yaml')
      return yaml.load(Buffer.from(response.data.content, 'base64').toString()) || {}
    } catch (e) {
      if (e.status === 404) {
        return null
      }
      if (this.nop) {
        const nopcommand = new NopCommand(filePath, this.repo, null,e, "ERROR")
        console.error(`NOPCOMMAND ${JSON.stringify(nopcommand)}`)
        this.appendToResults([nopcommand])
        //throw e
      } else {
        throw e
      }
    }
  }

  appendToResults(res) {
    if (this.nop) {
      this.results = this.results.concat(res.flat(3))
    }
  }

  async getReposForTeam(teamslug) {
    const options = this.github.rest.teams.listReposInOrg.endpoint.merge({
      org: this.repo.owner,
      team_slug: teamslug,
      per_page: 100,
    })
    return this.github.paginate(options)
  }

  isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
  }

  isIterable(obj) {
    // checks for null and undefined
    if (obj == null) {
      return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
  }

  mergeDeep(target, ...sources) {
    if (!sources.length) return target;
    const source = sources.shift();
    if (this.isObject(target) && this.isObject(source)) {
      for (const key in source) {
        if (this.isObject(source[key]) || Array.isArray(source[key])) {
          if (!target[key]) {
            if (Array.isArray(source[key])) {
              Object.assign(target, {
                [key]: []
              })
            } else {
              Object.assign(target, {
                [key]: {}
              })
            }
          }
          if (Array.isArray(source[key]) && Array.isArray(target[key])) {
            // Deep merge Array so that if the same element is there in source and target,
            // override the target with source otherwise include both source and target elements
            const visited = {}
            const combined = []
            let index = 0
            const temp = [...source[key],...target[key]]
            this.log.debug(`merging array ${JSON.stringify(temp)}`)
            for (const a of temp) {
              if (visited[a.name]) {
                this.log.debug(`Calling canOverride for key ${key} `)
                if (this.overridevalidators[key]) {
                  if (!this.overridevalidators[key].canOverride(a, visited[a.name])) {
                    this.log.error(`Error in calling overridevalidator for key ${key} ${this.overridevalidators[key].error}`)
                    throw new Error(this.overridevalidators[key].error)
                  }
                }
                continue
              } else if (visited[a.username]) {
                this.log.debug(`Calling canOverride for key ${key} `)
                if (this.overridevalidators[key]) {
                  if (!this.overridevalidators[key].canOverride(a, visited[a.username])) {
                    this.log.error(`Error in calling overridevalidator for key ${key} ${this.overridevalidators[key].error}`)
                    throw new Error(this.overridevalidators[key].error)
                  }
                }
                continue
              }
              if (a.name) {
                visited[a.name] = a
              } else if (a.username) {
                visited[a.username] = a
              }
              if (this.configvalidators[key]) {
                this.log.debug(`Calling configvalidator for key ${key} `)
                if (!this.configvalidators[key].isValid(a)) {
                  this.log.error(`Error in calling configvalidator for key ${key} ${this.configvalidators[key].error}`)
                  throw new Error(this.configvalidators[key].error)
                }
              }
              combined[index++] = a
            }

            this.log.debug(`merged array ${JSON.stringify(combined)}`)
            Object.assign(target, {
             [key]: combined
            })
          } else {
            this.mergeDeep(target[key], source[key]);
          }
        } else {
          Object.assign(target, {
            [key]: source[key]
          })
        }
      }
    }
    return this.mergeDeep(target, ...sources);
  }

}

Settings.FILE_NAME = '.github/settings.yml'

Settings.PLUGINS = {
  repository: require('./plugins/repository'),
  labels: require('./plugins/labels'),
  collaborators: require('./plugins/collaborators'),
  teams: require('./plugins/teams'),
  milestones: require('./plugins/milestones'),
  branches: require('./plugins/branches'),
  validator: require('./plugins/validator')
}

module.exports = Settings
