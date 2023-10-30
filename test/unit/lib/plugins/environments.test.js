const { when } = require('jest-when')
const Environments = require('../../../../lib/plugins/environments')

describe('Environments', () => {
    let github
    const org = 'bkeepers'
    const repo = 'test'
  
    function fillEnvironment(attrs) {
        if (!attrs.wait_timer) attrs.wait_timer = 0;
        if (!attrs.prevent_self_review) attrs.prevent_self_review = false;
        if (!attrs.reviewers) attrs.reviewers = [];
        if (!attrs.deployment_branch_policy) attrs.deployment_branch_policy = null;
        if(!attrs.variables) attrs.variables = [];
        if(!attrs.deployment_protection_rules) attrs.deployment_protection_rules = [];
        if(!attrs.protection_rules) attrs.protection_rules = [];

        return attrs;
    }

    beforeAll(() => {
      github = {
        request: jest.fn().mockReturnValue(Promise.resolve(true))
      }
    })

    it('sync', () => {
        const plugin = new Environments(undefined, github, {owner: org, repo}, [
            {
                name: 'wait-timer',
                wait_timer: 1
            },
            {
                name: 'reviewers',
                reviewers: [
                    {
                        type: 'User',
                        id: 1
                    },
                    {
                        type: 'Team',
                        id: 2
                    }
                ]
            },
            {
                name: 'prevent-self-review',
                prevent_self_review: true
            },
            {
                name: 'deployment-branch-policy',
                deployment_branch_policy: {
                    protected_branches: true,
                    custom_branch_policies: false
                }
            },
            {
                name: 'deployment-branch-policy-custom',
                deployment_branch_policy: {
                    protected_branches: false,
                    custom_branch_policies: [
                        'master',
                        'dev'
                    ]
                }
            },
            {
                name: 'variables',
                variables: [
                    {
                        name: 'test',
                        value: 'test'
                    }
                ]
            },
            {
                name: 'deployment-protection-rules',
                deployment_protection_rules: [
                    {
                        app_id: 1
                    }
                ]
            }
        ], {
            debug: function() {}
        });

        when(github.request)
            .calledWith('GET /repos/:org/:repo/environments', { org, repo })
            .mockResolvedValue({
                data: {
                    environments: [
                        fillEnvironment({
                            name: 'wait-timer',
                            wait_timer: 0
                        }),
                        fillEnvironment({
                            name: 'reviewers',
                            reviewers: []
                        }),
                        fillEnvironment({
                            name: 'prevent-self-review',
                            prevent_self_review: false
                        }),
                        fillEnvironment({
                            name: 'deployment-branch-policy',
                            deployment_branch_policy: null
                        }),
                        fillEnvironment({
                            name: 'deployment-branch-policy-custom',
                            deployment_branch_policy: null
                        }),
                        fillEnvironment({
                            name: 'variables',
                            variables: []
                        }),
                        fillEnvironment({
                            name: 'deployment-protection-rules',
                            deployment_protection_rules: []
                        })
                    ]
                }
            });
        
        ['wait-timer', 'reviewers', 'prevent-self-review', 'deployment-branch-policy', 'deployment-branch-policy-custom', 'variables', 'deployment-protection-rules'].forEach((environment_name) => {
            when(github.request)
                .calledWith('GET /repos/:org/:repo/environments/:environment_name/variables', { org, repo, environment_name })
                .mockResolvedValue({
                    data: {
                        variables: []
                    }
                })
        });

        ['wait-timer', 'reviewers', 'prevent-self-review', 'deployment-branch-policy', 'deployment-branch-policy-custom', 'variables', 'deployment-protection-rules'].forEach((environment_name) => {
            when(github.request)
                .calledWith('GET /repos/:org/:repo/environments/:environment_name/deployment_protection_rules', { org, repo, environment_name })
                .mockResolvedValue({
                    data: {
                        custom_deployment_protection_rules: []
                    }
                }) 
        });

        when(github.request)
            .calledWith('GET /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', { org, repo, environment_name: 'deployment-branch-policy-custom' })
            .mockResolvedValue({
                data: {
                    branch_policies: []
                }
            });

        when(github.request)
            .calledWith('DELETE /repos/:org/:repo/environments/:environment_name/deployment-branch-policies/:branch_policy_id')
            .mockResolvedValue({});

        when(github.request)
            .calledWith('POST /repos/:org/:repo/environments/:environment_name/deployment-branch-policies')
            .mockResolvedValue({});

        when(github.request)
            .calledWith('PUT /repos/:org/:repo/environments/:environment_name')
            .mockResolvedValue({});

        when(github.request)
            .calledWith('POST /repos/:org/:repo/environments/:environment_name/variables')
            .mockResolvedValue({});

        when(github.request)
            .calledWith('POST /repos/:org/:repo/environments/:environment_name/deployment_protection_rules')
            .mockResolvedValue({});

        when(github.request)
            .calledWith('DELETE /repos/:org/:repo/environments/:environment_name/deployment_protection_rules/:rule_id')
            .mockResolvedValue({});


        return plugin.sync().then(() => {
            expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/environments', { org, repo });

            ['wait-timer', 'reviewers', 'prevent-self-review', 'deployment-branch-policy', 'deployment-branch-policy-custom', 'variables', 'deployment-protection-rules'].forEach((environment_name) => {
                expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/environments/:environment_name/variables', { org, repo, environment_name });

                expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/environments/:environment_name/deployment_protection_rules', { org, repo, environment_name });
            });

            expect(github.request).toHaveBeenCalledWith('PUT /repos/:org/:repo/environments/:environment_name', expect.objectContaining({
                org,
                repo,
                environment_name: 'wait-timer',
                wait_timer: 1
            }));

            expect(github.request).toHaveBeenCalledWith('PUT /repos/:org/:repo/environments/:environment_name', expect.objectContaining({
                org,
                repo,
                environment_name: 'reviewers',
                reviewers: [
                    {
                        type: 'User',
                        id: 1
                    },
                    {
                        type: 'Team',
                        id: 2
                    }
                ]
            }));

            expect(github.request).toHaveBeenCalledWith('PUT /repos/:org/:repo/environments/:environment_name', expect.objectContaining({
                org,
                repo,
                environment_name: 'prevent-self-review',
                prevent_self_review: true
            }));

            expect(github.request).toHaveBeenCalledWith('PUT /repos/:org/:repo/environments/:environment_name', expect.objectContaining({
                org,
                repo,
                environment_name: 'prevent-self-review',
                prevent_self_review: true
            }));

            expect(github.request).toHaveBeenCalledWith('PUT /repos/:org/:repo/environments/:environment_name', expect.objectContaining({
                org,
                repo,
                environment_name: 'deployment-branch-policy',
                deployment_branch_policy: {
                    protected_branches: true,
                    custom_branch_policies: false
                }
            }));

            expect(github.request).toHaveBeenCalledWith('PUT /repos/:org/:repo/environments/:environment_name', expect.objectContaining({
                org,
                repo,
                environment_name: 'deployment-branch-policy-custom',
                deployment_branch_policy: {
                    protected_branches: false,
                    custom_branch_policies: true
                }
            }));

            expect(github.request).toHaveBeenCalledWith('POST /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', expect.objectContaining({
                org,
                repo,
                environment_name: 'deployment-branch-policy-custom',
                name: 'master'
            }));

            expect(github.request).toHaveBeenCalledWith('POST /repos/:org/:repo/environments/:environment_name/deployment-branch-policies', expect.objectContaining({
                org,
                repo,
                environment_name: 'deployment-branch-policy-custom',
                name: 'dev'
            }));

            expect(github.request).toHaveBeenCalledWith('POST /repos/:org/:repo/environments/:environment_name/variables', expect.objectContaining({
                org,
                repo,
                environment_name: 'variables',
                name: 'test',
                value: 'test'
            }));

            expect(github.request).toHaveBeenCalledWith('POST /repos/:org/:repo/environments/:environment_name/deployment_protection_rules', expect.objectContaining({
                org,
                repo,
                environment_name: 'deployment-protection-rules',
                integration_id: 1
            }));
        })
    })
})