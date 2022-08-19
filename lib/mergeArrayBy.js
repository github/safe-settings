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

function mergeBy (properties, target, source, options) {
  const destination = target.slice()

  source.forEach(sourceItem => {
    const matchingIndex = findMatchingIndex(properties, sourceItem, target)
    if (matchingIndex > -1) {
      destination[matchingIndex] = merge(target[matchingIndex], sourceItem, options)
    } else {
      destination.push(sourceItem)
    }
  })

  return destination
}

module.exports = mergeBy
