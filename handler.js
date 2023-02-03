const {
  createLambdaFunction,
  createProbot
} = require('@probot/adapter-aws-lambda-serverless')

const appFn = require('./')

module.exports.webhooks = createLambdaFunction(appFn, {
  probot: createProbot()
})

module.exports.scheduler = function () {
  const probot = createProbot()
  const app = appFn(probot)
  return app.syncInstallation()
}
