const { createProbot } = require('probot')
const appFn = require('./')

const probot = createProbot()
probot.log.info('Starting full sync.')
const app = appFn(probot, {})
app.syncInstallation()
  .then(settings => {
    if (settings.errors.length > 0) {
      probot.log.error('Errors occurred during full sync.')
      process.exit(1)
    } else {
      probot.log.info('Done with full sync.')
    }
  })
  .catch(error => {
    process.stdout.write(`Unexpected error during full sync: ${error}\n`)
    process.exit(1)
  })
