const { when } = require('jest-when');
const Variables = require('../../../../lib/plugins/variables');

describe('Variables', () => {
    let github;
    const org = 'bkeepers';
    const repo = 'test';

    function fillVariables(variables = []) {
        return variables;
    }

    beforeAll(() => {
        github = {
            request: jest.fn().mockReturnValue(Promise.resolve(true)),
        };
    });

    it('sync', () => {
        const plugin = new Variables(undefined, github, { owner: org, repo }, [{ name: 'test', value: 'test' }], {
            debug() {},
        });

        when(github.request)
            .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
            .mockResolvedValue({
                data: {
                    variables: [
                        fillVariables({
                            variables: [],
                        }),
                    ],
                },
            });

        ['variables'].forEach(() => {
            when(github.request)
                .calledWith('GET /repos/:org/:repo/actions/variables', { org, repo })
                .mockResolvedValue({
                    data: {
                        variables: [],
                    },
                });
        });

        when(github.request).calledWith('POST /repos/:org/:repo/actions/variables').mockResolvedValue({});

        return plugin.sync().then(() => {
            expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo });

            ['variables'].forEach(() => {
                expect(github.request).toHaveBeenCalledWith('GET /repos/:org/:repo/actions/variables', { org, repo });
            });

            expect(github.request).toHaveBeenCalledWith(
                'POST /repos/:org/:repo/actions/variables',
                expect.objectContaining({
                    org,
                    repo,
                    name: 'TEST',
                    value: 'test',
                })
            );
        });
    });
});
