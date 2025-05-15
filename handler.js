const {
  createLambdaFunction,
  createProbot
} = require('@probot/adapter-aws-lambda-serverless')
const { getProbotOctoKit } = require('./lib/proxyAwareProbotOctokit')

const appFn = require('./')

module.exports.webhooks = createLambdaFunction(appFn, {
  probot: createProbot({ overrides: { Octokit: getProbotOctoKit() } })
})

module.exports.scheduler = function () {
  const probot = createProbot({ overrides: { Octokit: getProbotOctoKit() } })
  const app = appFn(probot, {})
  return app.syncInstallation()
}
