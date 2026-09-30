import {jest} from '@jest/globals'

const LIMITS = {
    user: {maxRate: 25, maxConcurrency: 10},
    project: {maxRate: 100, maxConcurrency: 40},
    sepalProject: {maxRate: 50, maxConcurrency: 20},
    global: {maxRate: 200, maxConcurrency: 100}
}

jest.unstable_mockModule('#gee/config', () => ({googleProjectId: 'sepal-test-project', eeLimits: LIMITS}))

const {eeLimiterTiers} = await import('#gee/jobs/service/eeLimiter')

test('a call is limited as its user, then its project, then globally', () => {
    const tiers = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})
    const request = {username: 'alice', projectId: 'alice-project'}

    expect(tiers.map(({name, key}) => [name, key(request)])).toEqual([
        ['user', 'alice'],
        ['project', 'alice-project'],
        ['global', 'global']
    ])
})

test('the SEPAL project has limits of its own, other projects share the common ones', () => {
    const [, project] = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})

    expect(project.limits('sepal-test-project')).toBe(LIMITS.sepalProject)
    expect(project.limits('alice-project')).toBe(LIMITS.project)
})
