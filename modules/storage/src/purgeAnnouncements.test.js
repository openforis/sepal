import {configureNoLogging} from '#sepal/log'

import {STORAGE_PUBLISHERS} from './events.js'
import {PurgeAnnouncements} from './purgeAnnouncements.js'

describe('PurgeAnnouncements.republish', () => {
    let announced
    let subscription

    beforeAll(() => configureNoLogging())

    beforeEach(() => {
        announced = []
        subscription = STORAGE_PUBLISHERS
            .find(({key}) => key === 'storage.UserStorageErased').publish$
            .subscribe(({username}) => announced.push(username))
    })

    afterEach(() => subscription.unsubscribe())

    test('announces again every user purged within the last week', async () => {
        const repository = purgedSince({[at('2026-10-06T12:00:00Z')]: ['alice', 'bob']})
        const announcements = new PurgeAnnouncements({repository, now: () => at('2026-10-13T12:00:00Z')})

        await announcements.republish()

        expect(announced).toEqual(['alice', 'bob'])
    })

    test('survives a failing history read', async () => {
        const repository = {recentlyPurged: async () => { throw new Error('db down') }}
        const announcements = new PurgeAnnouncements({repository, now: () => at('2026-10-13T12:00:00Z')})

        await expect(announcements.republish()).resolves.toBeUndefined()
        expect(announced).toEqual([])
    })
})

const purgedSince = usernamesBySince => ({
    recentlyPurged: async since => usernamesBySince[since] ?? []
})

const at = iso => new Date(iso)
