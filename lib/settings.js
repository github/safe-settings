const path = require('path')

const fs = require('fs')
class Settings {
  static syncAll(context, repo, config) {
    const settings = new Settings(context, repo, config)
    settings.loadConfigs()
    return settings.updateAll()
  }

  static sync(context, repo, config) {
    const settings = new Settings(context, repo, config)
    settings.loadConfigs()
    return settings.update()
  }

  constructor(context, repo, config) {
    this.context = context
    this.installation_id = context.payload.installation.id
    this.github = context.octokit
    this.repo = repo
    //this.org = repo.owner
    this.config = config
    this.log = context.log
    //this.overridePaths =  getRepoConfigMap(this.github, this.repo, this.log)

  }

  async loadConfigs() {    
    this.repoConfigs = await this.getRepoConfigs(this.github, this.repo, this.log)
    this.subOrgConfigs = await this.getSubOrgConfigs(this.github, this.repo, this.log)
  }

  async update() {
    this.subOrgConfigs = await this.getSubOrgConfigs(this.github, this.repo, this.log)
    let repoConfig = this.config.repositories.find(config => {
      //this.log.debug(`In update ${this.repo.owner}, ${config.org}, ${JSON.stringify(this.repo)}, ${config.name}`)
      return this.repo.repo === config.name
    })

    // Overlay repo config
    this.repoConfigs = await this.getRepoConfigs(this.github, this.repo, this.log)
    const overrideRepoConfig = this.repoConfigs[`${this.repo.repo}.yml`]?.repository
    //this.log.debug(`overrideRepoConfig =  ${JSON.stringify(overrideRepoConfig)}`)
    if (overrideRepoConfig) {
      repoConfig = Object.assign({}, repoConfig, overrideRepoConfig)
    }
    if (repoConfig) {
      this.log.debug(`found a matching repoconfig for this repo ${JSON.stringify(repoConfig)}`)
      const childPlugins = this.childPluginsList(this.repo.repo)
      const RepoPlugin = Settings.PLUGINS.repository
      return new RepoPlugin(this.github, this.repo, repoConfig, this.installation_id, this.log).sync().then( () => {
        return Promise.all(
          childPlugins.map(([Plugin, config]) => {
            new Plugin(this.github, this.repo, config, this.log).sync()
          }))
        })
    } else {
      this.log.debug(`Didnt find any a matching repoconfig for this repo ${JSON.stringify(this.repo)} in ${JSON.stringify(this.repoConfigs)}`)
      const childPlugins = this.childPluginsList(this.repo.repo)
      return Promise.all(childPlugins.map(([Plugin, config]) => {
        new Plugin(this.github, this.repo, config, this.log).sync()
      }))
    }
  }

  async updateAll() {
    this.subOrgConfigs = await this.getSubOrgConfigs(this.github, this.repo, this.log)
    this.repoConfigs = await this.getRepoConfigs(this.github, this.repo, this.log)
    return Promise.all(
      this.config.repositories.map(repoconfig => {
        const RepoPlugin = Settings.PLUGINS.repository
        const repo = Object.assign({ owner: repoconfig.org, repo: repoconfig.name })
        return new RepoPlugin(this.github, repo, repoconfig, this.installation_id, this.log).sync()
      })).then(() => { 
        return this.eachRepository(this.github, this.config.restrictedRepos, this.log)
      })
    
    //   return new RepoPlugin(this.github, repo, repoconfig, this.installation_id, this.log).sync().then(() => {
    //     return Promise.all(
    //       childPlugins.map(
    //         ([Plugin, config]) => { return new Plugin(this.github, repo, config, this.log).sync() }
    //       )
    //     )
    //   })
    // }),
    // eachRepository(childPlugins,this.github, this.log)
    // )
  }

  async updateSubOrg() {
    this.repoConfigs = await this.getRepoConfigs(this.github, this.repo, this.log)
    this.subOrgConfigs = await this.getSubOrgConfigs(this.github, this.repo, this.log)
    return Promise.all(
      this.config.repositories.map(repoconfig => {
        const RepoPlugin = Settings.PLUGINS.repository
        const repo = Object.assign({ owner: repoconfig.org, repo: repoconfig.name })
        return new RepoPlugin(this.github, repo, repoconfig, this.installation_id, this.log).sync()
      })).then(() => { 
        return this.eachRepository(this.github, this.config.restrictedRepos, this.log)
      })
    
    //   return new RepoPlugin(this.github, repo, repoconfig, this.installation_id, this.log).sync().then(() => {
    //     return Promise.all(
    //       childPlugins.map(
    //         ([Plugin, config]) => { return new Plugin(this.github, repo, config, this.log).sync() }
    //       )
    //     )
    //   })
    // }),
    // eachRepository(childPlugins,this.github, this.log)
    // )
  }

  childPluginsList(repoName) {
    // Overlay with subOrgConfig
    let newConfig = Object.assign({}, this.config, this.subOrgConfigs[repoName])
    const overrideRepoConfig = this.repoConfigs[`${repoName}.yml`]
    if (overrideRepoConfig) {
      newConfig = Object.assign({}, this.config, overrideRepoConfig)
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

  eachRepository(github, restrictedRepos, log) {
    log('Fetching repositories')
    //let childPluginsList = this.childPluginsList
    github.paginate('GET /installation/repositories').then(repositories => {
      // Debating if we should put a Promise.all in the return
      return repositories.forEach(repository => {
        // Skip configuring any restricted repos
        if (restrictedRepos.includes(repository.name)) {
          log.debug(`Skipping retricted repo ${repository.name}`)
          return
        } else {
          log.debug(`${repository.name} not in restricted repos ${restrictedRepos}`)
        }
        const { owner, name } = repository
        const childPlugins = this.childPluginsList(name)
        return Promise.all(
          childPlugins.map(
            ([Plugin, config]) => { return new Plugin(github, { owner: owner.login, repo: name }, config, log).sync() }
          )
        )
      })
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
        this.log.error(e)
        this.log.error(`Error getting settings ${e}`)
      })

      if (!response) {
        return
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
      throw e
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
      const params = Object.assign(repo, { path: path.posix.join(CONFIG_PATH, 'repos') })

      const response = await this.loadConfigMap(params)
      return response
    } catch (e) {
      throw e
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
      const params = Object.assign(repo, { path: path.posix.join(CONFIG_PATH, 'suborgs') })

      const response = await this.loadConfigMap(params)
      return response
    } catch (e) {
      throw e
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
      //log.debug(`XXXXXXX overridePaths = ${JSON.stringify(overridePaths)}`)
      const repoConfigs = {}
      //const overrideConfigs = []

      for (let override of overridePaths) {
        const data = await this.loadYaml(override.path)
        this.log.debug(`data = ${JSON.stringify(data)}`)
        //overrideConfigs.push({ name: override.name, path: override.path, data: data})
        repoConfigs[override.name] = data
      }
      //log.debug(`override configs = ${JSON.stringify(overrideConfigs)}`)
      this.log.debug(`repo configs = ${JSON.stringify(repoConfigs)}`)
      return repoConfigs
    } catch (e) {
      throw e
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
      //log.debug(`XXXXXXX overridePaths = ${JSON.stringify(overridePaths)}`)
      const subOrgConfigs = {}
      //const overrideConfigs = []

      for (let override of overridePaths) {
        const data = await this.loadYaml(override.path)
        this.log.debug(`data = ${JSON.stringify(data)}`)
        //overrideConfigs.push({ name: override.name, path: override.path, data: data})
        subOrgConfigs[override.name] = data
        data.suborgrepos.forEach(repository => {
          subOrgConfigs[repository]=data
        })
      }
      //log.debug(`override configs = ${JSON.stringify(overrideConfigs)}`)
      this.log.debug(`suborg configs = ${JSON.stringify(subOrgConfigs)}`)
      return subOrgConfigs
    } catch (e) {
      throw e
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
      const params = Object.assign(repo, { path: filePath })
      const response = await this.github.repos.getContent(params).catch(e => {
        console.log(e)
        console.error(`Error getting settings ${e}`)
      })
      //log.debug(`In loadYAML ${JSON.stringify(response.data)}`)
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
      throw e
    }
  }

}
// async function eachRepository (context, config) {
//   this.log('Fetching repositories')
//   const github = context.github
//   const repositories = await github.paginate(
//     github.apps.listRepos.endpoint.merge({ per_page: 100 }),
//     response => {
//       return response.data.repositories
//     }
//   )
//   return repositories.forEach(repo => { return Settings.sync(context, { owner: repo.owner.login, repo: repo.name }, config) })
// }

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
