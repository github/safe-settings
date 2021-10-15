class NopCommand {
    
    constructor(pluginName, repo, endpoint, action) {
        this.plugin = pluginName
        this.repo = repo.repo
        this.endpoint = endpoint?endpoint.url:""
        this.body = endpoint?endpoint.body:""
        this.action = action                     
    }

    toString() {
        return `${this.plugin} plugin will perform ${this.action} using this API ${this.endpoint} passing ${JSON.stringify(this.body, null, 4)}`
    }

}
module.exports = NopCommand