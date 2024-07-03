const Diffable = require('./diffable')

module.exports = class Environments extends Diffable {
    constructor(...args) {
        super(...args)

        if (this.entries) {
            // Force all names to lowercase to avoid comparison issues.
            this.entries.forEach(environment => {
              environment.name = environment.name.toLowerCase();
              if(environment.variables) {
                environment.variables.forEach(variable => {
                    variable.name = variable.name.toLowerCase();
                });
              }
            })
          }
    }

    async find() {
        const { data: { environments } } = await this.github.request('GET /repos/:org/:repo/environments', {
            org: this.repo.owner,
            repo: this.repo.repo
        });

        let environments_mapped = [];

        for(let environment of environments) {
            const mapped = {
                name: environment.name.toLowerCase(),
                repo: this.repo.repo,
                wait_timer: (environment.protection_rules.find(rule => rule.type === 'wait_timer') || { wait_timer: 0 }).wait_timer,
                prevent_self_review: (environment.protection_rules.find(rule => rule.type === 'required_reviewers') || { prevent_self_review: false }).prevent_self_review,
                reviewers: (environment.protection_rules.find(rule => rule.type === 'required_reviewers') || { reviewers: [] }).reviewers.map(reviewer => ({id: reviewer.reviewer.id, type: reviewer.type})),
                deployment_branch_policy: environment.deployment_branch_policy === null ? null : {
                    protected_branches: (environment.deployment_branch_policy || { protected_branches: false }).protected_branches,
                    custom_branch_policies: (environment.deployment_branch_policy || { custom_branch_policies: false }).custom_branch_policies && (await this.github.request('GET /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', {
                        org: this.repo.owner,
                        repo: this.repo.repo,
                        environment_name: environment.name
                    })).data.branch_policies.map(policy => ({
                        name: policy.name
                    }))
                },
                variables: (await this.github.request('GET /repos/:org/:repo/environments/:environment_name/variables', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: environment.name
                })).data.variables.map(variable => ({name: variable.name.toLowerCase(), value: variable.value})),
                deployment_protection_rules: (await this.github.request('GET /repos/:org/:repo/environments/:environment_name/deployment_protection_rules', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: environment.name
                })).data.custom_deployment_protection_rules.map(rule => ({
                    app_id: rule.app.id,
                    id: rule.id
                }))
            }
            environments_mapped.push(mapped);
            //console.log(mapped);
        }

        return environments_mapped;
    }

    comparator(existing, attrs) {
        return existing.name === attrs.name
    }

    getChanged(existing, attrs) {
        if (!attrs.wait_timer) attrs.wait_timer = 0;
        if (!attrs.prevent_self_review) attrs.prevent_self_review = false;
        if (!attrs.reviewers) attrs.reviewers = [];
        if (!attrs.deployment_branch_policy) attrs.deployment_branch_policy = null;
        if(!attrs.variables) attrs.variables = [];
        if(!attrs.deployment_protection_rules) attrs.deployment_protection_rules = [];

        const wait_timer = existing.wait_timer !== attrs.wait_timer;
        const prevent_self_review = existing.prevent_self_review !== attrs.prevent_self_review;
        const reviewers = JSON.stringify(existing.reviewers.sort((x1, x2) => x1.id - x2.id)) !== JSON.stringify(attrs.reviewers.sort((x1, x2) => x1.id - x2.id));
        
        let existing_custom_branch_policies = existing.deployment_branch_policy === null ? null : existing.deployment_branch_policy.custom_branch_policies;
        if(typeof(existing_custom_branch_policies) === 'object' && existing_custom_branch_policies !== null) {
            existing_custom_branch_policies = existing_custom_branch_policies.sort();
        }
        let attrs_custom_branch_policies = attrs.deployment_branch_policy === null ? null : attrs.deployment_branch_policy.custom_branch_policies;
        if(typeof(attrs_custom_branch_policies) === 'object' && attrs_custom_branch_policies !== null) {
            attrs_custom_branch_policies = attrs_custom_branch_policies.sort();
        }
        let deployment_branch_policy;
        if(existing.deployment_branch_policy === attrs.deployment_branch_policy) {
            deployment_branch_policy = false;
        }
        else {
            deployment_branch_policy = (
                (existing.deployment_branch_policy === null && attrs.deployment_branch_policy !== null) ||
                (existing.deployment_branch_policy !== null && attrs.deployment_branch_policy === null) ||
                (existing.deployment_branch_policy.protected_branches !== attrs.deployment_branch_policy.protected_branches) ||
                 (JSON.stringify(existing_custom_branch_policies) !== JSON.stringify(attrs_custom_branch_policies))
            );
        }

        const variables = JSON.stringify(existing.variables.sort((x1, x2) => x1.name - x2.name)) !== JSON.stringify(attrs.variables.sort((x1, x2) => x1.name - x2.name));
        const deployment_protection_rules = JSON.stringify(existing.deployment_protection_rules.map(x => ({app_id: x.app_id})).sort((x1, x2) => x1.app_id - x2.app_id)) !== JSON.stringify(attrs.deployment_protection_rules.map(x => ({app_id: x.app_id})).sort((x1, x2) => x1.app_id - x2.app_id));

        return {wait_timer, prevent_self_review, reviewers, deployment_branch_policy, variables, deployment_protection_rules};
    }

    changed(existing, attrs) {
        const {wait_timer, prevent_self_review, reviewers, deployment_branch_policy, variables, deployment_protection_rules} = this.getChanged(existing, attrs);

        return wait_timer || prevent_self_review || reviewers || deployment_branch_policy || variables || deployment_protection_rules;
    }

    async update(existing, attrs) {
        const {wait_timer, prevent_self_review, reviewers, deployment_branch_policy, variables, deployment_protection_rules} = this.getChanged(existing, attrs);

        if(wait_timer || prevent_self_review || reviewers || deployment_branch_policy) {
            await this.github.request(`PUT /repos/:org/:repo/environments/:environment_name`, {
                org: this.repo.owner,
                repo: this.repo.repo,
                environment_name: attrs.name,
                wait_timer: attrs.wait_timer,
                prevent_self_review: attrs.prevent_self_review,
                reviewers: attrs.reviewers,
                deployment_branch_policy: attrs.deployment_branch_policy === null ? null : {
                    protected_branches: attrs.deployment_branch_policy.protected_branches,
                    custom_branch_policies: !!attrs.deployment_branch_policy.custom_branch_policies
                }
            })
        }

        if(deployment_branch_policy && attrs.deployment_branch_policy && attrs.deployment_branch_policy.custom_branch_policies) {
            const existingPolicies = (await this.github.request('GET /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', {
                org: this.repo.owner,
                repo: this.repo.repo,
                environment_name: attrs.name
            })).data.branch_policies;

            for(let policy of existingPolicies) {
                await this.github.request('DELETE /repos/:org/:repo/environments/:environment_name/deployment-branch-policies/:branch_policy_id', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: attrs.name,
                    branch_policy_id: policy.id
                });
            }

            for(let policy of attrs.deployment_branch_policy.custom_branch_policies) {
                await this.github.request('POST /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: attrs.name,
                    name: policy
                });
            }
        }

        if(variables) {
            let existingVariables = [...existing.variables];
            for(let variable of attrs.variables) {
                const existingVariable = existingVariables.find((_var) => _var.name === variable.name);
                if(existingVariable) {
                    existingVariables = existingVariables.filter(_var => _var.name !== variable.name);
                    if(existingVariable.value !== variable.value) {
                        await this.github.request(`PATCH /repos/:org/:repo/environments/:environment_name/variables/:variable_name`, {
                            org: this.repo.owner,
                            repo: this.repo.repo,
                            environment_name: attrs.name,
                            variable_name: variable.name,
                            value: variable.value
                        });
                    }
                }
                else {
                    await this.github.request(`POST /repos/:org/:repo/environments/:environment_name/variables`, {
                        org: this.repo.owner,
                        repo: this.repo.repo,
                        environment_name: attrs.name,
                        name: variable.name,
                        value: variable.value
                    });
                }
            }

            for(let variable of existingVariables) {
                await this.github.request('DELETE /repos/:org/:repo/environments/:environment_name/variables/:variable_name', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: attrs.name,
                    variable_name: variable.name
                });
            }
        }

        if(deployment_protection_rules) {
            let existingRules = [...existing.deployment_protection_rules];
            for(let rule of attrs.deployment_protection_rules) {
                const existingRule = existingRules.find((_rule) => _rule.id === rule.id);

                if(!existingRule) {
                    await this.github.request(`POST /repos/:org/:repo/environments/:environment_name/deployment_protection_rules`, {
                        org: this.repo.owner,
                        repo: this.repo.repo,
                        environment_name: attrs.name,
                        integration_id: rule.app_id
                    });
                }
            }

            for(let rule of existingRules) {
                await this.github.request('DELETE /repos/:org/:repo/environments/:environment_name/deployment_protection_rules/:rule_id', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: attrs.name,
                    rule_id: rule.id
                });
            }
        }
    }

    async add(attrs) {
        await this.github.request(`PUT /repos/:org/:repo/environments/:environment_name`, {
            org: this.repo.owner,
            repo: this.repo.repo,
            environment_name: attrs.name,
            wait_timer: attrs.wait_timer,
            prevent_self_review: attrs.prevent_self_review,
            reviewers: attrs.reviewers,
            deployment_branch_policy: attrs.deployment_branch_policy === null ? null : {
                protected_branches: attrs.deployment_branch_policy.protected_branches,
                custom_branch_policies: !!attrs.deployment_branch_policy.custom_branch_policies
            }
        });

        if(attrs.deployment_branch_policy && attrs.deployment_branch_policy.custom_branch_policies) {
            for(let policy of attrs.deployment_branch_policy.custom_branch_policies) {
                await this.github.request('POST /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', {
                    org: this.repo.owner,
                    repo: this.repo.repo,
                    environment_name: attrs.name,
                    name: policy.name
                });
            }
        }
        

        for(let variable of attrs.variables) {
            await this.github.request(`POST /repos/:org/:repo/environments/:environment_name/variables`, {
                org: this.repo.owner,
                repo: this.repo.repo,
                environment_name: attrs.name,
                name: variable.name,
                value: variable.value
            });
        }

        for(let rule of attrs.deployment_protection_rules) {
            await this.github.request(`POST /repos/:org/:repo/environments/:environment_name/deployment_protection_rules`, {
                org: this.repo.owner,
                repo: this.repo.repo,
                environment_name: attrs.name,
                integration_id: rule.app_id
            });
        }
    }

    async remove(existing) {
        await this.github.request(`DELETE /repos/:org/:repo/environments/:environment_name`, {
            org: this.repo.owner,
            repo: this.repo.repo,
            environment_name: existing.name
        });
    }
}
