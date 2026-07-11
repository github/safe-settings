/* eslint-disable no-undef */

const fs = require('fs')
const path = require('path')

// The generated schemas declare JSON Schema draft 2020-12, where OpenAPI 3.0's
// `nullable` keyword does not exist. The build consumes GitHub's OpenAPI 3.1
// description, which models null-ability as `type: [X, 'null']` unions instead,
// so no `nullable` keyword may survive in the output.
describe('dereferenced schemas', () => {
  const files = ['settings.json', 'suborgs.json', 'repos.json']

  files.forEach(file => {
    describe(file, () => {
      const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schema/dereferenced', file)))

      it('contains no OpenAPI `nullable` keywords', () => {
        const found = []
        const walk = (node, at) => {
          if (Array.isArray(node)) {
            node.forEach((v, i) => walk(v, `${at}/${i}`))
          } else if (node && typeof node === 'object') {
            if ('nullable' in node) {
              found.push(at)
            }
            Object.entries(node).forEach(([k, v]) => walk(v, `${at}/${k}`))
          }
        }
        walk(schema, '')
        expect(found).toEqual([])
      })
    })
  })

  it('allows null for required-but-nullable branch protection fields', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schema/dereferenced/settings.json')))
    const protection = schema.properties.branches.items.properties.protection
    const protectionObject = protection.anyOf.find(variant => variant.type === 'object')
    const requiredStatusChecks = protectionObject.properties.required_status_checks
    expect(requiredStatusChecks.type).toContain('null')
    expect(protectionObject.properties.restrictions.type).toContain('null')
  })

  // `protection: null` is safe-settings' own delete-branch-protection semantic
  // (see isEmpty in lib/plugins/branches.js); the GitHub API's PUT body it is
  // validated against does not model that, so the schema allows null explicitly.
  it('allows `protection: null` in every schema that has branches', () => {
    files.forEach(file => {
      const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schema/dereferenced', file)))
      const protection = schema.properties.branches.items.properties.protection
      expect(protection.anyOf).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'null' })]))
    })
  })
})
