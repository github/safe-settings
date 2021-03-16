class Settings {
  static syncAll (context, repo, config) {
    return new Settings(context, repo, config).updateAll()
  }

  static sync (context, repo, config) {
    return new Settings(context, repo, config).update()
  }

  constructor (context, repo, config) {
    this.context = context
    this.installation_id = context.payload.installation.id
    this.github = context.github
    this.repo = repo
    this.org = repo.org
    this.config = config
    this.log = context.log
  }

  update () {
    const childPlugins = this.childPluginsList()
    return Promise.all(childPlugins.map(([Plugin, config]) => {
      new Plugin(this.github, this.repo, config, this.log).sync()
    }))
  }

  updateAll () {
    const childPlugins = this.childPluginsList()
    return Promise.all(
      this.config.repositories.map(repoconfig => {
        const RepoPlugin = Settings.PLUGINS.repository
        const repo = Object.assign({ owner: repoconfig.org, repo: repoconfig.name })
        return new RepoPlugin(this.github, repo, repoconfig, this.installation_id, this.log).sync()
      }),
      eachRepository(childPlugins, this.github, this.config.restrictedRepos, this.log)
    )
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

  childPluginsList () {
    const childPlugins = []
    for (const [section, config] of Object.entries(this.config)) {
      if (section !== 'repositories') {
        this.log(`Found section ${section} in the config. Creating plugin...`)
        // Ignore any config that is not a plugin
        if (section in Settings.PLUGINS) {
          const Plugin = Settings.PLUGINS[section]
          childPlugins.push([Plugin, config])
        }
      }
    }
    return childPlugins
  }
}

function eachRepository (childPlugins, github, restrictedRepos, log) {
  log('Fetching repositories')
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
      return Promise.all(
        childPlugins.map(
          ([Plugin, config]) => { return new Plugin(github, { owner: owner.login, repo: name }, config, log).sync() }
        )
      )
    })
  })
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
  branches: require('./plugins/branches')
}

module.exports = Settings
