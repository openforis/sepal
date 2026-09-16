import {describe, expect, it} from 'vitest'

import {launchStatusMessageKey} from './appLaunchStatus'

describe('launchStatusMessageKey', () => {
    it.each([
        ['STARTING_SESSION', 'apps.launch.startingSession'],
        ['STARTING_SERVER', 'apps.launch.startingServer'],
        ['STARTING_APP', 'apps.launch.startingApp'],
        ['FAILED', 'apps.run.error']
    ])('%s reads as %s', (appState, key) => {
        expect(launchStatusMessageKey(appState)).toBe(key)
    })

    it('a ready app has no status to show', () => {
        expect(launchStatusMessageKey('READY')).toBeUndefined()
    })
})
