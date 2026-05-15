const {firstValueFrom} = require('rxjs')
const {createRedisHistory} = require('#mcp/chat/conversation/redisHistory')
const {aFakeRedis} = require('./fakeRedis')

describe('Redis history adapter', () => {

    const key = 'ai:chat:alice:conversation:conv-1:history'

    let redis, history

    beforeEach(() => {
        redis = aFakeRedis()
        history = createRedisHistory({
            redis,
            username: 'alice',
            conversationId: 'conv-1',
            ttlMs: 60000
        })
    })

    it('returns the appended messages on load', async () => {
        await firstValueFrom(history.append$({role: 'user', content: 'first'}))
        await firstValueFrom(history.append$({role: 'assistant', content: 'reply'}))

        expect(await firstValueFrom(history.load$())).toEqual([
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'}
        ])
        expect(redis.expirations).toContainEqual({key, seconds: 60})
    })

    it('starts empty', async () => {
        expect(await firstValueFrom(history.load$())).toEqual([])
    })

    it('clears persisted messages', async () => {
        await firstValueFrom(history.append$({role: 'user', content: 'first'}))

        await firstValueFrom(history.clear$())

        expect(await firstValueFrom(history.load$())).toEqual([])
        expect(redis.deletedKeys).toContain(key)
    })
})
