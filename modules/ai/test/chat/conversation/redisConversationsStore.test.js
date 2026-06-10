import {firstValueFrom} from 'rxjs'

import {createRedisConversationsStore} from '#mcp/chat/conversation/redisConversationsStore'

import {aFakeRedis} from './fakeRedis.js'

describe('Redis ConversationsStore adapter', () => {

    const metaA = {id: 'a', title: '', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'}
    const metaB = {id: 'b', title: '', createdAt: '2024-01-01T00:01:00.000Z', updatedAt: '2024-01-01T00:01:00.000Z'}
    const key = 'ai:chat:alice:conversations'
    const historyKeyA = 'ai:chat:alice:conversation:a:history'

    let redis, store

    beforeEach(() => {
        redis = aFakeRedis()
        store = createRedisConversationsStore({redis, username: 'alice', ttlMs: 60000})
    })

    it('stores meta records and lists most recently updated first', async () => {
        await firstValueFrom(store.add$(metaA))
        await firstValueFrom(store.add$(metaB))

        expect(await firstValueFrom(store.list$())).toEqual([metaB, metaA])
        expect(redis.expirations).toContainEqual({key, seconds: 60})
    })

    it('looks up meta by id', async () => {
        await firstValueFrom(store.add$(metaA))

        expect(await firstValueFrom(store.get$('a'))).toEqual(metaA)
        expect(await firstValueFrom(store.get$('nope'))).toBeUndefined()
    })

    it('updates updatedAt on touch and reports whether the record existed', async () => {
        await firstValueFrom(store.add$(metaA))

        expect(await firstValueFrom(store.touch$('a', '2024-01-01T00:02:00.000Z'))).toBe(true)
        expect(await firstValueFrom(store.get$('a'))).toEqual({
            ...metaA,
            updatedAt: '2024-01-01T00:02:00.000Z'
        })
        expect(await firstValueFrom(store.touch$('nope', '2024-01-01T00:02:00.000Z'))).toBe(false)
    })

    it('updates the title on existing records and reports whether it existed', async () => {
        await firstValueFrom(store.add$(metaA))

        expect(await firstValueFrom(store.updateTitle$('a', 'NDVI change Kenya'))).toBe(true)
        expect(await firstValueFrom(store.get$('a'))).toEqual({...metaA, title: 'NDVI change Kenya'})
        expect(await firstValueFrom(store.updateTitle$('nope', 'anything'))).toBe(false)
    })

    it('removes metadata and conversation history on delete', async () => {
        await firstValueFrom(store.add$(metaA))
        await redis.rpush(historyKeyA, JSON.stringify({role: 'user', content: 'hello'}))

        expect(await firstValueFrom(store.delete$('a'))).toBe(true)
        expect(await firstValueFrom(store.delete$('a'))).toBe(false)
        expect(await firstValueFrom(store.list$())).toEqual([])
        expect(redis.deletedKeys).toContain(historyKeyA)
    })
})
