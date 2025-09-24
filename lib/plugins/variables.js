const _ = require('lodash')
const Diffable = require('./diffable')

module.exports = class Variables extends Diffable {
  constructor (...args) {
    super(...args)

    if (this.entries) {
      // Force all names to uppercase to avoid comparison issues.
      this.entries.forEach((variable) => {
        variable.name = variable.name.toUpperCase()
      })
    }
  }

  /**
     * Look-up existing variables for a given repository
     *
     * @see {@link https://docs.github.com/en/rest/actions/variables?apiVersion=2022-11-28#list-repository-variables} list repository variables
     * @returns {Array.<object>} Returns a list of variables that exist in a repository
     */
  async find () {
    this.log.debug(`Finding repo vars for ${this.repo.owner}/${this.repo.repo}`)
    const { data: { variables } } = await this.github.request('GET /repos/:org/:repo/actions/variables', {
      org: this.repo.owner,
      repo: this.repo.repo
    })
    return variables
  }

  /**
     * Compare the existing variables with what we've defined as code
     *
     * @param {Array.<object>} existing Existing variables defined in the repository
     * @param {Array.<object>} variables Variables that we have defined as code
     *
     * @returns {object} The results of a list comparison
     */
  getChanged (existing, variables = []) {
    const result =
            JSON.stringify(
              existing.sort((x1, x2) => {
                return x1.name.toUpperCase().localeCompare(x2.name.toUpperCase())
              })
            ) !==
            JSON.stringify(
              variables.sort((x1, x2) => {
                return x1.name.toUpperCase().localeCompare(x2.name.toUpperCase())
              })
            )
    return result
  }

  /**
     * Compare existing variables with what's defined
     *
     * @param {Object} existing The existing entries in GitHub
     * @param {Object} attrs The entries defined as code
     *
     * @returns
     */
  comparator (existing, attrs) {
    return existing.name === attrs.name
  }

  /**
     * Return a list of changed entries
     *
     * @param {Object} existing The existing entries in GitHub
     * @param {Object} attrs The entries defined as code
     *
     * @returns
     */
  changed (existing, attrs) {
    return this.getChanged(_.castArray(existing), _.castArray(attrs))
  }

  /**
     * Update an existing variable if the value has changed
     *
     * @param {Array.<object>} existing Existing variables defined in the repository
     * @param {Array.<object>} variables Variables that we have defined as code
     *
     * @see {@link https://docs.github.com/en/rest/actions/variables?apiVersion=2022-11-28#update-a-repository-variable} update a repository variable
     * @returns
     */
  async update (existing, variables = []) {
    this.log.debug(`Updating a repo var existing params ${JSON.stringify(existing)} and new ${JSON.stringify(variables)}`)
    existing = _.castArray(existing)
    variables = _.castArray(variables)
    const changed = this.getChanged(existing, variables)

    if (changed) {
      let existingVariables = [...existing]
      for (const variable of variables) {
        const existingVariable = existingVariables.find((_var) => _var.name === variable.name)
        if (existingVariable) {
          existingVariables = existingVariables.filter((_var) => _var.name !== variable.name)
          if (existingVariable.value !== variable.value) {
            await this.github
              .request('PATCH /repos/:org/:repo/actions/variables/:variable_name', {
                org: this.repo.owner,
                repo: this.repo.repo,
                variable_name: variable.name.toUpperCase(),
                value: variable.value.toString()
              })
              .then((res) => {
                return res
              })
              .catch((e) => {
                this.logError(e)
              })
          }
        } else {
          await this.github
            .request('POST /repos/:org/:repo/actions/variables', {
              org: this.repo.owner,
              repo: this.repo.repo,
              name: variable.name.toUpperCase(),
              value: variable.value.toString()
            })
            .then((res) => {
              return res
            })
            .catch((e) => {
              this.logError(e)
            })
        }
      }

      for (const variable of existingVariables) {
        await this.github
          .request('DELETE /repos/:org/:repo/actions/variables/:variable_name', {
            org: this.repo.owner,
            repo: this.repo.repo,
            variable_name: variable.name.toUpperCase()
          })
          .then((res) => {
            return res
          })
          .catch((e) => {
            this.logError(e)
          })
      }
    }
  }

  /**
     * Add a new variable to a given repository
     *
     * @param {object} variable The variable to add, with name and value
     *
     * @see {@link https://docs.github.com/en/rest/actions/variables?apiVersion=2022-11-28#create-a-repository-variable} create a repository variable
     * @returns
     */
  async add (variable) {
    this.log.debug(`Adding a repo var with the params ${JSON.stringify(variable)}`)
    await this.github
      .request('POST /repos/:org/:repo/actions/variables', {
        org: this.repo.owner,
        repo: this.repo.repo,
        name: variable.name,
        value: variable.value.toString()
      })
      .then((res) => {
        return res
      })
      .catch((e) => {
        this.logError(e)
      })
  }

  /**
     * Remove variables that aren't defined as code
     *
     * @param {String} existing Name of the existing variable to remove
     *
     * @see {@link https://docs.github.com/en/rest/actions/variables?apiVersion=2022-11-28#delete-a-repository-variable} delete a repository variable
     * @returns
     */
  async remove (existing) {
    this.log.debug(`Removing a repo var with the params ${JSON.stringify(existing)}`)
    await this.github
      .request('DELETE /repos/:org/:repo/actions/variables/:variable_name', {
        org: this.repo.owner,
        repo: this.repo.repo,
        variable_name: existing.name
      })
      .then((res) => {
        return res
      })
      .catch((e) => {
        this.logError(e)
      })
  }
}
