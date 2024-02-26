const { run } = require('@probot/adapter-github-actions')
const app = require('./')

run(() => {
  app.syncInstallation()
}).catch((error) => {
  console.error(error)
  process.exit(1)
})
