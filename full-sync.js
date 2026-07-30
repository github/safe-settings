const appFn = require('./')
const { FULL_SYNC_NOP } = require('./lib/env')
const { createProbot } = require('probot')
const pino = require('pino')

async function performFullSync (appFn, nop) {
  const logLevel = process.env.LOG_LEVEL || 'info'
  const logger = pino({
    level: logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
        customColors: 'info:blue,warn:yellow,error:red',
        levelFirst: true
      }
    }
  })

  const probot = createProbot({ overrides: { log: logger } })
  probot.log.info(`Starting full sync with NOP=${nop}`)

  try {
    const app = appFn(probot, {})
    const settings = await app.syncInstallation(nop)

    if (settings && settings.errors && settings.errors.length > 0) {
      probot.log.error('Errors occurred during full sync.')
      process.exit(1)
    }

    probot.log.info('Full sync completed successfully.')
  } catch (error) {
    process.stdout.write(`Unexpected error during full sync: ${error}\n`)
    process.exit(1)
  }
}

if (require.main === module) {
  performFullSync(appFn, FULL_SYNC_NOP).catch((error) => {
    console.error('Fatal error during full sync:', error)
    process.exit(1)
  })
}

module.exports = { performFullSync }
