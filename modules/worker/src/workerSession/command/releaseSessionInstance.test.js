import {jest} from '@jest/globals'

import {configureNoLogging} from '#sepal/log'

import {releaseSessionInstance} from './releaseSessionInstance.js'

describe('releaseSessionInstance', () => {
    beforeAll(configureNoLogging)

    test('revokes the session key after the instance is released', async () => {
        const repo = {clearApiKey: jest.fn(async () => {})}

        await releaseSessionInstance(SESSION, {repo, releaseInstance: async () => {}})

        expect(repo.clearApiKey).toHaveBeenCalledWith('s-1')
    })

    test('revokes the session key and rethrows when the release fails', async () => {
        const repo = {clearApiKey: jest.fn(async () => {})}
        const releaseError = new Error('release failed')

        await expect(releaseSessionInstance(SESSION, {
            repo, releaseInstance: async () => { throw releaseError }
        })).rejects.toBe(releaseError)

        expect(repo.clearApiKey).toHaveBeenCalledWith('s-1')
    })

    test('reports the release error, not the revocation error, when both fail', async () => {
        const repo = {clearApiKey: async () => { throw new Error('db down') }}
        const releaseError = new Error('release failed')

        await expect(releaseSessionInstance(SESSION, {
            repo, releaseInstance: async () => { throw releaseError }
        })).rejects.toBe(releaseError)
    })

    const SESSION = {sessionId: 's-1', instanceId: 'i-1'}
})
