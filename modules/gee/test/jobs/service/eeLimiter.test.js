import {jest} from '@jest/globals'

const LIMITS = {
    user: {maxRate: 25, maxConcurrency: 10},
    project: {maxRate: 100, maxConcurrency: 40},
    sepalProject: {maxRate: 50, maxConcurrency: 20},
    global: {maxRate: 200, maxConcurrency: 100},
    taskUser: {maxRate: 10, maxConcurrency: 5},
    taskGlobal: {maxRate: 50, maxConcurrency: 20}
}

jest.unstable_mockModule('#gee/config', () => ({googleProjectId: 'sepal-test-project', eeLimits: LIMITS}))

const {eeLimiterTiers} = await import('#gee/jobs/service/eeLimiter')

test('an interactive call passes the task tiers unlimited, then its user, project and the global tier', () => {
    const tiers = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})
    const request = {username: 'alice', projectId: 'alice-project', origin: 'interactive'}

    expect(tiers.map(({name, key}) => [name, key(request)])).toEqual([
        ['taskUser', 'interactive'],
        ['taskGlobal', 'interactive'],
        ['user', 'alice'],
        ['project', 'alice-project'],
        ['global', 'global']
    ])
    expect(tiers[0].limits('interactive')).toEqual({})
    expect(tiers[1].limits('interactive')).toEqual({})
})

test('a task call is capped per user and across all tasks before the shared tiers', () => {
    const [taskUser, taskGlobal] = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})
    const request = {username: 'alice', projectId: 'alice-project', origin: 'task'}

    expect(taskUser.key(request)).toBe('task:alice')
    expect(taskUser.limits(taskUser.key(request))).toBe(LIMITS.taskUser)
    expect(taskGlobal.key(request)).toBe('task')
    expect(taskGlobal.limits(taskGlobal.key(request))).toBe(LIMITS.taskGlobal)
})

test('the SEPAL project has limits of its own, other projects share the common ones', () => {
    const [, , , project] = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})

    expect(project.limits('sepal-test-project')).toBe(LIMITS.sepalProject)
    expect(project.limits('alice-project')).toBe(LIMITS.project)
})
