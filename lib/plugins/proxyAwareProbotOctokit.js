// This custom plugin overrides the default ProbotOctokit plugin and support Http Proxy.
const { Octokit } = require('@octokit/core')
const { createProbotAuth } = require('octokit-auth-probot')
const getProxiedFetch = require('../proxiedFetch')

const ProbotOctokit = Octokit.plugin().defaults((instanceOptions) => {
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
module.exports = { ProbotOctokit, getProbotOctoKit }
