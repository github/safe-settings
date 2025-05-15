// This custom plugin overrides the default ProbotOctokit plugin and support Http Proxy.
const { Octokit } = require('@octokit/core')
const { enterpriseCompatibility } = require('@octokit/plugin-enterprise-compatibility')
// const { RequestOptions } = require('@octokit/types')
const { paginateRest } = require('@octokit/plugin-paginate-rest')
const { legacyRestEndpointMethods } = require('@octokit/plugin-rest-endpoint-methods')
const { retry } = require('@octokit/plugin-retry')
const { throttling } = require('@octokit/plugin-throttling')
const { config } = require('@probot/octokit-plugin-config')
const { createProbotAuth } = require('octokit-auth-probot')
const getProxiedFetch = require('./proxiedFetch')

const ProbotOctokit = Octokit.plugin(
  throttling,
  retry,
  paginateRest,
  legacyRestEndpointMethods,
  enterpriseCompatibility,
  config
).defaults((instanceOptions) => {
  const defaultOptions = {
    authStrategy: createProbotAuth,
    throttle: {
      onSecondaryRateLimit: (
        retryAfter,
        options,
        octokit
      ) => {
        octokit.log.warn(
          `SecondaryRateLimit hit with "${options.method} ${options.url}", retrying in ${retryAfter} seconds.`
        )
        return true
      },
      onRateLimit: (
        retryAfter,
        options,
        octokit
      ) => {
        octokit.log.warn(
          `Rate limit hit with "${options.method} ${options.url}", retrying in ${retryAfter} seconds.`
        )
        return true
      }
    },
    userAgent: 'probot',
    request: {
      fetch: getProxiedFetch(instanceOptions.baseUrl) || fetch
    }
  }
  // merge options deeply
  const options = Object.assign({}, defaultOptions, instanceOptions, {
    request: Object.assign({}, defaultOptions.request, instanceOptions.request),
    throttle: instanceOptions.throttle
      ? Object.assign({}, defaultOptions.throttle, instanceOptions.throttle)
      : defaultOptions.throttle
  })
  return options
})

function getProbotOctoKit () {
  return ProbotOctokit
}
module.exports = { getProbotOctoKit }
