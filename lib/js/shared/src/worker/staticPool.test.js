import log4js from 'log4js'
import {firstValueFrom, of, timeout} from 'rxjs'

import {ROUND_ROBIN, StaticPool, STICKY} from './staticPool.js'

describe('a static pool', () => {
    beforeEach(() => {
        log4js.configure({
            appenders: {recording: {type: 'recording'}},
            categories: {default: {appenders: ['recording'], level: 'info'}}
        })
    })

    afterEach(async () => {
        await log4js.shutdown()
    })

    test('does not try to detach a user from a round-robin instance when the user goes idle', async () => {
        const pool = singleInstancePool(ROUND_ROBIN)

        await completeRequest(pool, 'alice')

        expect(poolWarnings()).toEqual([])
    })

    test('frees the instance of a sticky user for the next user once the user goes idle', async () => {
        const pool = singleInstancePool(STICKY)

        await completeRequest(pool, 'alice')

        await expect(completeRequest(pool, 'bob')).resolves.toBeDefined()
    })
})

function singleInstancePool(strategy) {
    return StaticPool({
        name: 'test',
        strategy,
        instances: 1,
        createDelayMs: 0,
        create$: () => of({ready: true})
    })
}

async function completeRequest(pool, username) {
    const result = await firstValueFrom(pool(username, `request-${username}`).pipe(timeout(2000)))
    await settle()
    return result
}

function poolWarnings() {
    return log4js.recording().replay()
        .filter(({categoryName, level}) => categoryName === 'pool' && level.levelStr === 'WARN')
        .map(({data}) => data.join(' '))
}

function settle() {
    return new Promise(resolve => setTimeout(resolve, 50))
}

