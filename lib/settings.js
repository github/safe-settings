class Settings {
  static syncAll (context, repo, config) {
    return new Settings(context, repo, config).updateAll()
  }
  static sync (context, repo, config) {
    return new Settings(context, repo, config).update()
  }
  constructor (context, repo, config) {
    this.installation_id=context.payload.installation.id
    this.github = context.github
    this.repo = repo
    this.org = repo.org
    this.config = config
    this.log = context.log
  }

  update () {
    let childPlugins = this.childPluginsList()
    return Promise.all(childPlugins.map(([Plugin,config])=>{new Plugin(this.github,this.repo,config,this.log).sync()}))
 }

  updateAll () {
    let childPlugins = this.childPluginsList()
 
    return Promise.all(this.config.repositories.map(repoconfig=>{    
      const RepoPlugin = Settings.PLUGINS['repository']
      let repo=Object.assign({ owner: repoconfig.org, repo: repoconfig.name})
      return new RepoPlugin(this.github, repo, repoconfig,this.installation_id,this.log).sync().then(childPlugins.map(([Plugin,config])=>{new Plugin(this.github,repo,config,this.log).sync()}))
    }))
 }

 childPluginsList() {
  let childPlugins = new Array()
  for (let [section, config] of Object.entries(this.config)) {
    if (section != 'repositories') {
      this.log(`Found section ${section} in the config. Creating plugin...`)
      const Plugin = Settings.PLUGINS[section]
      childPlugins.push([Plugin,config])      
    } 
  }
  return childPlugins
 }

}

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
