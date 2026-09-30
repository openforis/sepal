import {afterEach, describe, expect, it} from 'vitest'

import {ThemeManager} from './theme'

describe('ThemeManager', () => {
    const subscriptions = []
    afterEach(() => subscriptions.splice(0).forEach(subscription => subscription.unsubscribe()))

    describe('preference', () => {
        it('defaults to dark when nothing is stored', () => {
            const manager = new ThemeManager(environment())

            expect(manager.preference).toBe('dark')
            expect(manager.theme).toBe('dark')
        })

        it('restores the stored preference', () => {
            const manager = new ThemeManager(environment({stored: 'light'}))

            expect(manager.preference).toBe('light')
        })

        it.each(['blue', '"light"', ''])('treats the stored value %j as dark', stored => {
            const manager = new ThemeManager(environment({stored}))

            expect(manager.preference).toBe('dark')
        })

        it('persists a new preference', () => {
            const env = environment()
            const manager = new ThemeManager(env)

            manager.setPreference('light')

            expect(new ThemeManager(env).preference).toBe('light')
        })

        it('ignores an unknown preference', () => {
            const manager = new ThemeManager(environment())

            manager.setPreference('blue')

            expect(manager.preference).toBe('dark')
        })

        it('still switches for the session when storage is unavailable', () => {
            const manager = new ThemeManager(environment({storage: throwingStorage()}))

            manager.setPreference('light')

            expect(manager.preference).toBe('light')
            expect(manager.theme).toBe('light')
        })

        it('follows a preference changed in another browser tab', () => {
            const env = environment()
            const manager = new ThemeManager(env)

            env.storage.setItem('sepal:theme', 'light')
            env.events.dispatchEvent(Object.assign(new Event('storage'), {key: 'sepal:theme'}))

            expect(manager.theme).toBe('light')
        })
    })

    describe('system preference', () => {
        it('resolves from the operating system scheme', () => {
            const manager = new ThemeManager(environment({stored: 'system', systemLight: true}))

            expect(manager.theme).toBe('light')
        })

        it('follows the operating system scheme while the app is open', () => {
            const env = environment({stored: 'system', systemLight: false})
            const manager = new ThemeManager(env)
            const themes = []
            subscriptions.push(manager.theme$.subscribe(theme => themes.push(theme)))

            env.mediaQuery.change(true)

            expect(themes).toEqual(['dark', 'light'])
        })

        it('is not affected by the operating system scheme when a theme is chosen', () => {
            const env = environment({stored: 'dark', systemLight: false})
            const manager = new ThemeManager(env)
            const themes = []
            subscriptions.push(manager.theme$.subscribe(theme => themes.push(theme)))

            env.mediaQuery.change(true)

            expect(themes).toEqual(['dark'])
        })
    })

    describe('apply', () => {
        it('marks the document with the resolved theme', () => {
            const env = environment({stored: 'light'})
            const manager = new ThemeManager(env)

            subscriptions.push(manager.apply())

            expect(env.root.dataset.theme).toBe('light')
        })

        it('updates the document when the preference changes', () => {
            const env = environment()
            const manager = new ThemeManager(env)
            subscriptions.push(manager.apply())

            manager.setPreference('light')

            expect(env.root.dataset.theme).toBe('light')
        })

        it('shows the initial theme without animating', () => {
            const env = environment({stored: 'light'})
            const manager = new ThemeManager(env)

            subscriptions.push(manager.apply())

            expect(env.animations).toEqual([])
        })

        it('animates a switch from one theme to the other', () => {
            const env = environment()
            const manager = new ThemeManager(env)
            subscriptions.push(manager.apply())

            manager.setPreference('light')

            expect(env.animations).toEqual([{from: 'dark', to: 'light'}])
        })
    })
})

const environment = ({stored, systemLight = false, storage = memoryStorage()} = {}) => {
    if (stored !== undefined) {
        storage.setItem('sepal:theme', stored)
    }
    const root = document.createElement('div')
    const animations = []
    return {
        storage,
        mediaQuery: fakeMediaQuery(systemLight),
        root,
        events: new EventTarget(),
        animations,
        animate: update => {
            const from = root.dataset.theme
            update()
            animations.push({from, to: root.dataset.theme})
        }
    }
}

const memoryStorage = () => {
    const values = new Map()
    return {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    }
}

const throwingStorage = () => ({
    getItem: () => {
        throw new Error('SecurityError')
    },
    setItem: () => {
        throw new Error('SecurityError')
    }
})

const fakeMediaQuery = matches => {
    const target = new EventTarget()
    return {
        get matches() {
            return matches
        },
        addEventListener: (...args) => target.addEventListener(...args),
        removeEventListener: (...args) => target.removeEventListener(...args),
        change(nextMatches) {
            matches = nextMatches
            target.dispatchEvent(Object.assign(new Event('change'), {matches}))
        }
    }
}
