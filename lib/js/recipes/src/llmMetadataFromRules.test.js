const {llmMetadataFromRules} = require('./llmMetadataFromRules')

describe('llmMetadataFromRules — rule constraints', () => {

    it('projects rules with declared paths into {name, description, paths} constraints', () => {
        const rules = [{
            name: 'aBindsB',
            description: 'a must be consistent with b',
            paths: ['/a', '/b'],
            validate: () => []
        }]

        const {constraints} = llmMetadataFromRules(rules)

        expect(constraints).toEqual([
            {name: 'aBindsB', description: 'a must be consistent with b', paths: ['/a', '/b']}
        ])
    })

    it('drops rules that do not declare paths (cannot be projected as a path constraint)', () => {
        const rules = [
            {name: 'pathless', description: 'no paths', validate: () => []},
            {name: 'withPaths', description: 'has paths', paths: ['/x'], validate: () => []}
        ]

        const {constraints} = llmMetadataFromRules(rules)

        expect(constraints.map(constraint => constraint.name)).toEqual(['withPaths'])
    })

    it('passes through subjectPaths when the rule declares them (the violated path(s) the rule asserts about)', () => {
        const rules = [{
            name: 'seasonStartWindow',
            description: 'seasonStart must be in window of targetDate',
            paths: ['/dates/targetDate', '/dates/seasonStart'],
            subjectPaths: ['/dates/seasonStart'],
            validate: () => []
        }]

        const [constraint] = llmMetadataFromRules(rules).constraints

        expect(constraint.subjectPaths).toEqual(['/dates/seasonStart'])
    })

    it('omits subjectPaths when the rule does not declare them (pure trigger/context, no required promotion)', () => {
        const rules = [{
            name: 'plain', description: 'no subjects', paths: ['/a', '/b'], validate: () => []
        }]

        const [constraint] = llmMetadataFromRules(rules).constraints

        expect(constraint).not.toHaveProperty('subjectPaths')
    })

    it('returns fresh arrays each call so callers cannot mutate shared rule paths', () => {
        const rules = [{name: 'r', description: 'd', paths: ['/a'], subjectPaths: ['/a'], validate: () => []}]

        llmMetadataFromRules(rules).constraints[0].paths.push('/injected')
        llmMetadataFromRules(rules).constraints[0].subjectPaths.push('/injected')

        const [fresh] = llmMetadataFromRules(rules).constraints
        expect(fresh.paths).toEqual(['/a'])
        expect(fresh.subjectPaths).toEqual(['/a'])
    })
})
