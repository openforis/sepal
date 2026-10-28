import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

const LIMITS = {
    user: {maxRate: 25, maxConcurrency: 10},
    userProject: {maxRate: 100, maxConcurrency: 40},
    sepalProject: {maxRate: 50, maxConcurrency: 20},
    global: {maxRate: 200, maxConcurrency: 100},
    taskUser: {maxRate: 10, maxConcurrency: 5},
    taskGlobal: {maxRate: 50, maxConcurrency: 20}
}

mock.module('#gee/config', {
    exports: {
        googleProjectId: 'sepal-test-project',
        eeLimits: LIMITS
    }
})

const {eeLimiterTiers} = await import('#gee/jobs/service/eeLimiter')

test('an interactive call passes the task tiers unlimited, then its user, project and the global tier', () => {
    const tiers = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})
    const request = {username: 'alice', projectId: 'alice-project', origin: 'interactive'}

    assert.deepEqual(tiers.map(({name, key}) => [name, key(request)]), [
        ['taskUser', 'interactive'],
        ['taskGlobal', 'interactive'],
        ['user', 'alice'],
        ['project', 'alice-project'],
        ['global', 'global']
    ])
    assert.deepEqual(tiers[0].limits('interactive'), {})
    assert.deepEqual(tiers[1].limits('interactive'), {})
})

test('a task call is capped per user and across all tasks before the shared tiers', () => {
    const [taskUser, taskGlobal] = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})
    const request = {username: 'alice', projectId: 'alice-project', origin: 'task'}

    assert.equal(taskUser.key(request), 'task:alice')
    assert.equal(taskUser.limits(taskUser.key(request)), LIMITS.taskUser)
    assert.equal(taskGlobal.key(request), 'task')
    assert.equal(taskGlobal.limits(taskGlobal.key(request)), LIMITS.taskGlobal)
})

test('the SEPAL project has limits of its own, user projects share the user-project ones', () => {
    const [, , , project] = eeLimiterTiers({limits: LIMITS, sepalProjectId: 'sepal-test-project'})

    assert.equal(project.limits('sepal-test-project'), LIMITS.sepalProject)
    assert.equal(project.limits('alice-project'), LIMITS.userProject)
})
