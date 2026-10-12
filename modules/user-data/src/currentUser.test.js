import {requireAuth} from './currentUser.js'

describe('requireAuth', () => {
    it('passes the user named in the sepal-user header on to the route', async () => {
        const ctx = context({'sepal-user': JSON.stringify({username: 'alice', roles: []})})
        const next = recordingNext()

        await requireAuth(ctx, next)

        expect(next.calls).toBe(1)
        expect(ctx.state.currentUser).toEqual({username: 'alice', roles: []})
    })

    it('answers 401 without calling the route when the header is missing', async () => {
        const ctx = context({})
        const next = recordingNext()

        await requireAuth(ctx, next)

        expect(ctx.status).toBe(401)
        expect(next.calls).toBe(0)
    })

    it('answers 401 without calling the route when the header is not JSON', async () => {
        const ctx = context({'sepal-user': 'alice'})
        const next = recordingNext()

        await requireAuth(ctx, next)

        expect(ctx.status).toBe(401)
        expect(next.calls).toBe(0)
    })

    it('answers 401 when the header names no user', async () => {
        const ctx = context({'sepal-user': JSON.stringify({roles: []})})
        const next = recordingNext()

        await requireAuth(ctx, next)

        expect(ctx.status).toBe(401)
        expect(next.calls).toBe(0)
    })
})

const context = headers => ({headers, state: {}})

const recordingNext = () => {
    const next = async () => {
        next.calls++
    }
    next.calls = 0
    return next
}
