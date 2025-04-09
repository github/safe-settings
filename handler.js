const {
  createLambdaFunction,
  createProbot
} = require('@probot/adapter-aws-lambda-serverless')
const { getProbotOctoKit } = require('./lib/proxyAwareProbotOctokit')

const appFn = require('./')

module.exports.webhooks = createLambdaFunction(appFn, {
  probot: createProbot({ octokit: getProbotOctoKit() })
})

module.exports.scheduler = function () {
  const probot = createProbot({ octokit: getProbotOctoKit() })
  const app = appFn(probot, {})
  return app.syncInstallation()
}
