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
    expect(protectionObject.properties.required_status_checks.type).toContain('null')
    expect(protectionObject.properties.enforce_admins.type).toContain('null')
    expect(protectionObject.properties.restrictions.type).toContain('null')
  })

  // Suborg and repo override files feed the rulesets plugin at repo scope
  // (childPluginsList in lib/settings.js), so their schemas validate rulesets
  // against the repo-level API shape, not the org-level one.
  it('validates per-repo rulesets in the suborg and repo schemas', () => {
    ;['suborgs.json', 'repos.json'].forEach(file => {
      const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../../schema/dereferenced', file)))
      const ruleset = schema.properties.rulesets.items
      expect(ruleset.required).toEqual(['name', 'enforcement'])
      // org-only condition targeting must not leak into the repo-level shape
      expect(JSON.stringify(ruleset.properties.conditions)).not.toContain('repository_name')
      const actorTypes = ruleset.properties.bypass_actors.items.properties.actor_type.enum
      expect(actorTypes).toContain('User')
    })
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
