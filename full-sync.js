const { createProbot } = require('probot')
const appFn = require('./')

const probot = createProbot()
const app = appFn(probot, {})
app.syncInstallation()
