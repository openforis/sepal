import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {createRoutes} from './routes.js'

const ADMIN = {username: 'admin', roles: ['application_admin']}
const USER = {username: 'alice', roles: []}

describe('GET /mostRecentEvents', () => {
    it('returns the events to an admin', async () => {
        const events = {alice: {state: 'ACTIVE'}}
        const ctx = await request('/mostRecentEvents', {user: ADMIN, repository: aRepository({mostRecentEvents: events})})
        assert.deepEqual(ctx.body, events)
    })

    it('refuses a user who is not an admin', async () => {
        const ctx = await request('/mostRecentEvents', {user: USER})
        assert.equal(ctx.status, 403)
    })

    it('refuses a request without a user', async () => {
        const ctx = await request('/mostRecentEvents', {})
        assert.equal(ctx.status, 401)
    })
})

describe('GET /userEvents', () => {
    it('returns the requested user\'s events to an admin', async () => {
        const events = [{state: 'ACTIVE'}]
        const repository = aRepository({userEvents: {alice: events}})
        const ctx = await request('/userEvents', {user: ADMIN, query: {username: 'alice'}, repository})
        assert.deepEqual(ctx.body, events)
    })

    it('refuses a user who is not an admin, even for their own events', async () => {
        const ctx = await request('/userEvents', {user: USER, query: {username: USER.username}})
        assert.equal(ctx.status, 403)
    })
})

const aRepository = ({mostRecentEvents = {}, userEvents = {}} = {}) => ({
    getMostRecentEvents: async () => mostRecentEvents,
    getUserEvents: async username => userEvents[username]
})

const request = async (path, {user, query = {}, repository = aRepository()}) => {
    const handlers = {}
    const router = {
        get: (routePath, ...middleware) => {
            handlers[routePath] = middleware
            return router
        }
    }
    createRoutes(repository)(router)
    const ctx = {headers: user ? {'sepal-user': JSON.stringify(user)} : {}, query, state: {}}
    await runChain(handlers[path], ctx)
    return ctx
}

const runChain = async (middleware, ctx) => {
    const [first, ...rest] = middleware
    if (first) {
        await first(ctx, () => runChain(rest, ctx))
    }
}
