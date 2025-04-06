const { getProxyForUrl } = require('proxy-from-env')
const { ProxyAgent, fetch: undiciFetch } = require('undici')

function getProxiedFetch (url) {
  const proxyUrl = getProxyForUrl(url)
  if (proxyUrl) {
    // LOG.debug('Setting up proxy agent for ', url)
    return (url, options) => {
      return undiciFetch(url, {
        ...options,
        dispatcher: new ProxyAgent(proxyUrl)
      })
    }
  }
  return null
}

module.exports = getProxiedFetch
