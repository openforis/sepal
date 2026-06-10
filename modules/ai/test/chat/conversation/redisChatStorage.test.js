import {firstValueFrom} from 'rxjs'

import {createRedisChatStorage} from '#mcp/chat/conversation/redisChatStorage'

import {aFakeRedis} from './fakeRedis.js'

describe('Redis chat storage port', () => {
    const metaAlice = {id: 'a', title: '', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'}
    const metaBob = {id: 'b', title: '', createdAt: '2024-01-01T00:01:00.000Z', updatedAt: '2024-01-01T00:01:00.000Z'}

    let redis, storage
    beforeEach(() => {
        redis = aFakeRedis()
        storage = createRedisChatStorage({redis, ttlMs: 60000})
    })

    it('scopes conversations per username so users do not see each other\'s records', async () => {
        await firstValueFrom(storage.conversationsFor('alice').add$(metaAlice))
        await firstValueFrom(storage.conversationsFor('bob').add$(metaBob))

        expect(await firstValueFrom(storage.conversationsFor('alice').list$())).toEqual([metaAlice])
        expect(await firstValueFrom(storage.conversationsFor('bob').list$())).toEqual([metaBob])
    })

    it('applies the configured TTL to the conversations it stores', async () => {
        await firstValueFrom(storage.conversationsFor('alice').add$(metaAlice))

        expect(redis.expirations).toContainEqual(expect.objectContaining({seconds: 60}))
    })

    it('scopes history per username and conversation', async () => {
        const message = {role: 'user', content: 'hello'}
        await firstValueFrom(storage.historyFor('alice', 'c1').append$(message))

        expect(await firstValueFrom(storage.historyFor('alice', 'c1').load$())).toEqual([message])
        expect(await firstValueFrom(storage.historyFor('alice', 'c2').load$())).toEqual([])
        expect(await firstValueFrom(storage.historyFor('bob', 'c1').load$())).toEqual([])
    })
})
