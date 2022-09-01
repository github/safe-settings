/* eslint-disable camelcase */
const Diffable = require('./diffable')
const NopCommand = require('../nopcommand')

module.exports = class Autolinks extends Diffable {
  // constructor (...args) {
  //   super(...args)
  // }

  async find () {
    const { data } = await this.github.repos.listAutolinks(this.repo)
    return data
  }

  comparator (existing, attr) {
    return existing.key_prefix === attr.key_prefix && existing.url_template === attr.url_template
  }

  changed (existing, attr) {
    return existing.key_prefix === attr.key_prefix && existing.url_template !== attr.url_template
  }

  async update (existing, attr) {
    await this.remove(existing)
    return this.add(attr)
  }

  async add ({ key_prefix, url_template }) {
    const attrs = {
      ...this.repo,
      key_prefix,
      url_template
    }

    if (this.nop) {
      return new NopCommand(
        this.constructor.name,
        this.repo,
        this.github.repos.createAutolink.endpoint(attrs),
        'Add autolink'
      )
    }

    try {
      return this.github.repos.createAutolink(attrs)
    } catch (e) {
      if (e?.response?.data?.errors?.[0]?.code === 'already_exists') {
        this.log.debug(`Did not update ${key_prefix}, as it already exists`)
        return
      }
      throw e
    }
  }

  async remove ({ id }) {
    const attrs = {
      ...this.repo,
      autolink_id: id
    }
    if (this.nop) {
      return new NopCommand(
        this.constructor.name,
        this.repo,
        this.github.repos.deleteAutolink.endpoint(attrs),
        'Remove autolink'
      )
    }
    return this.github.repos.deleteAutolink(attrs)
  }
}
