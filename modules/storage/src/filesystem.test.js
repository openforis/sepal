import {jest} from '@jest/globals'

import {configureNoLogging} from '#sepal/log'

jest.unstable_mockModule('./config.js', () => ({homeDir: '/homes'}))

const {calculateUserStorage} = await import('./filesystem.js')

beforeAll(() => configureNoLogging())

describe('calculateUserStorage', () => {
    it('measures the user\'s home', async () => {
        const disk = fakeDisk({'/homes/alice': 1000})

        expect(await calculateUserStorage('alice', disk)).toBe(1000)
    })

    it('leaves Data export staging out, as if the home did not hold it', async () => {
        const disk = fakeDisk({'/homes/alice': 1000, '/homes/alice/.data-staging': 300})

        expect(await calculateUserStorage('alice', disk)).toBe(700)
    })

    it('never measures a home below zero', async () => {
        const disk = fakeDisk({'/homes/alice': 100, '/homes/alice/.data-staging': 300})

        expect(await calculateUserStorage('alice', disk)).toBe(0)
    })
})

// Sizes as diskus reports them, a directory's size including everything under it.
const fakeDisk = sizes => ({
    usage: async path => sizes[path],
    isDirectory: async path => path in sizes
})
