// https://github.com/KyleAMathews/deepmerge#arraymerge

const merge = require('deepmerge')

function findMatchingIndex (properties, sourceItem, target) {
  const hasAnyProperty = item => properties.some(prop => Object.prototype.hasOwnProperty.call(item, prop))
  if (hasAnyProperty(sourceItem)) {
    return target
      .filter(targetItem => hasAnyProperty(targetItem))
      .findIndex(targetItem => properties.some(prop => sourceItem[prop] && targetItem[prop] && sourceItem[prop] === targetItem[prop]))
  }
}

function mergeBy (key, configvalidator, overridevalidator, properties, target, source, options) {
  const destination = target.slice()
  source.forEach(sourceItem => {
    const matchingIndex = findMatchingIndex(properties, sourceItem, target)
    if (matchingIndex > -1) {
      if (overridevalidator) {
        if (!overridevalidator.canOverride(target[matchingIndex], sourceItem)) {
          throw new Error(overridevalidator.error)
        }
      }
      destination[matchingIndex] = merge(target[matchingIndex], sourceItem, options)
      if (configvalidator) {
        if (!configvalidator.isValid(destination[matchingIndex])) {
          throw new Error(configvalidator.error)
        }
      }
    } else {
      destination.push(sourceItem)
      if (configvalidator) {
        if (!configvalidator.isValid(sourceItem)) {
          throw new Error(configvalidator.error)
        }
      }
    }
  })

  return destination
}

module.exports = mergeBy
