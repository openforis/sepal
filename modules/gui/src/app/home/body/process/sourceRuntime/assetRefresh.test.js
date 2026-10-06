import {Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {assetAuthority, CURRENT, DEFAULT_ASSET_POLICY, EXPIRED, UNAVAILABLE, WAITING} from './assetEvidence'
import {AssetRefresh} from './assetRefresh'

// When asset evidence is read, over a fake versions endpoint answered by the test and a clock it moves.

describe('claiming assets', () => {
    it('reads them at once, in one request for every asset claimed together', () => {
        const session = sessionOver()

        session.refresh.claim(['users/x/a', 'users/x/b'])

        expect(session.requests.map(({ids}) => ids)).toEqual([['users/x/a', 'users/x/b']])
    })

    it('does not read again evidence a consumer just claimed', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})

        session.refresh.claim(['users/x/a'])

        expect(session.requests).toHaveLength(1)
    })

    it('keeps reading every 4.5 minutes while claimed and visible', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})

        session.advance(269000)
        expect(session.requests).toHaveLength(1)
        session.advance(1000)

        expect(session.requests).toHaveLength(2)
    })

    it('reads nothing while the page is hidden, and evidence older than a minute once it is visible', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.hide()

        session.advance(600000)
        expect(session.requests).toHaveLength(1)
        session.show()

        expect(session.requests).toHaveLength(2)
    })

    it('publishes the lapse of authority when it comes', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.hide()

        session.advance(300000)

        expect(session.evidence('users/x/a').expired).toBe(true)
        expect(session.authority('users/x/a')).toBe(EXPIRED)
    })
})

describe('releasing assets', () => {
    it('stops reading them as soon as the last consumer releases them', () => {
        const session = sessionOver()
        const first = session.refresh.claim(['users/x/a'])
        const second = session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})

        first()
        session.advance(270000)
        expect(session.requests).toHaveLength(2)
        second()
        session.advance(270000)

        expect(session.requests).toHaveLength(2)
    })

    it('keeps their evidence for a minute, to answer a consumer reopening without reading again', () => {
        const session = sessionOver()
        const release = session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        release()

        session.advance(30000)
        session.refresh.claim(['users/x/a'])

        expect(session.requests).toHaveLength(1)
        expect(session.evidence('users/x/a').version).toBe('v1')
    })

    // A consumer replacing its claim - releasing, then claiming again - cancels the read it was waiting for.
    it('reads at once an asset claimed again after its last release cancelled the read it awaited', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])()

        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})

        expect(session.requests).toHaveLength(2)
        expect(session.authority('users/x/a')).toBe(CURRENT)
    })

    it('forgets their evidence a minute after release', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])()
        session.answer({'users/x/a': 'v1'})

        session.advance(60000)

        expect(session.evidence('users/x/a')).toBeUndefined()
    })

    it.each([
        ['after an unchanged answer', async session => {
            session.answer({'users/x/a': 'v1'})
            await settled()
        }],
        ['while a follow-up read is awaited', async () => {}]
    ])('ends the follow-up reads of a mutation %s', async (_case, followedUp) => {
        const session = sessionOver()
        const release = session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.invalidate(['users/x/a'])
        session.advance(0)
        await followedUp(session)

        release()
        await settled()
        session.advance(30000)

        expect(session.requests).toHaveLength(2)
    })

    it('resumes the follow-up reads of a mutation when an asset it left stale is claimed again', async () => {
        const session = sessionOver()
        const release = session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.invalidate(['users/x/a'])
        session.advance(0)
        session.answer({'users/x/a': 'v1'})
        await settled()
        release()
        session.advance(5000)

        session.refresh.claim(['users/x/a'])
        session.advance(0)
        session.answer({'users/x/a': 'v2'})

        expect(session.requests).toHaveLength(3)
        expect(session.authority('users/x/a')).toBe(CURRENT)
    })
})

describe('an answer', () => {
    it('from a request a later one replaced changes nothing, whichever arrives first', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.refresh.refresh(['users/x/a'], {force: true})

        session.answer({'users/x/a': 'v2'}, 1)
        session.answer({'users/x/a': 'v1'}, 0)

        expect(session.evidence('users/x/a').version).toBe('v2')
    })

    it('read under credentials since replaced changes nothing, and every claimed asset is read again once', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a', 'users/x/b'])
        session.answer({'users/x/a': 'v1', 'users/x/b': 'v1'})
        session.refresh.refresh(['users/x/a'], {force: true})

        session.replaceCredentials()
        session.answer({'users/x/a': 'v2'}, 1)

        expect(session.evidence('users/x/a')?.version).not.toBe('v2')
        expect(session.requests.slice(2).map(({ids}) => ids)).toEqual([['users/x/a', 'users/x/b']])
    })

    it('that fails leaves what was known, and authorizes nothing until a read succeeds', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.refresh(['users/x/a'], {force: true})

        session.fail()

        expect(session.evidence('users/x/a').version).toBe('v1')
        expect(session.authority('users/x/a')).toBe(UNAVAILABLE)
        session.refresh.refresh(['users/x/a'], {force: true})
        session.answer({'users/x/a': 'v1'})
        expect(session.authority('users/x/a')).toBe(CURRENT)
    })
})

describe('the asset catalogue', () => {
    it('reading a new updateTime, or no longer listing an asset, has that asset read at once', () => {
        const session = sessionOver({catalogue: {'users/x/a': 'T1', 'users/x/b': 'T1'}})
        session.refresh.claim(['users/x/a', 'users/x/b'])
        session.answer({'users/x/a': 'v1', 'users/x/b': 'v1'})

        session.catalogue({'users/x/a': 'T2'})

        expect(session.requests.slice(1).map(({ids}) => ids)).toEqual([['users/x/a', 'users/x/b']])
    })
})

describe('a mutation this session made', () => {
    it('withholds authority at once, and keeps it withheld through an unchanged answer until the token changes', async () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/collection'])
        session.answer({'users/x/collection': 'v1'})

        session.refresh.invalidate(['users/x/collection'])
        expect(session.authority('users/x/collection')).toBe(WAITING)
        session.advance(0)
        session.answer({'users/x/collection': 'v1'})
        await settled()
        expect(session.authority('users/x/collection')).toBe(WAITING)
        session.advance(3000)
        session.answer({'users/x/collection': 'v2'})

        expect(session.authority('users/x/collection')).toBe(CURRENT)
        session.advance(60000)
        expect(session.requests).toHaveLength(3)
    })

    it('lets what was read stand once the follow-up reads end without another token', async () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.invalidate(['users/x/a'])

        for (const delay of [0, 3000, 7000, 20000]) {
            session.advance(delay)
            session.answer({'users/x/a': 'v1'})
            await settled()
        }

        expect(session.requests).toHaveLength(5)
        expect(session.authority('users/x/a')).toBe(CURRENT)
    })

    it('that deleted an asset is settled by reading it missing', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})

        session.refresh.invalidate(['users/x/a'])
        session.advance(0)
        session.answer({'users/x/a': {failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}})

        expect(session.evidence('users/x/a').stale).toBeNull()
        expect(session.authority('users/x/a')).toBe(UNAVAILABLE)
    })

    it('says nothing about assets no consumer reads or remembers', () => {
        const session = sessionOver()

        session.refresh.invalidate(['users/x/unread'])
        session.advance(60000)

        expect(session.requests).toHaveLength(0)
        expect(session.evidence('users/x/unread')).toBeUndefined()
    })
})

describe('failures naming an asset', () => {
    it('read it once however many consumers report it, and not again while its token is unchanged', async () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})

        session.refresh.reportFailure(['users/x/a'])
        session.refresh.reportFailure(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.reportFailure(['users/x/a'])

        expect(session.requests).toHaveLength(2)
        session.advance(DEFAULT_ASSET_POLICY.failureCheckIntervalMs)
        session.answer({'users/x/a': 'v1'})
        session.refresh.reportFailure(['users/x/a'])
        expect(session.requests).toHaveLength(4)
    })

    it('read it again once its token has changed since the last check', () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.reportFailure(['users/x/a'])
        session.answer({'users/x/a': 'v1'})
        session.refresh.refresh(['users/x/a'], {force: true})
        session.answer({'users/x/a': 'v2'})

        session.refresh.reportFailure(['users/x/a'])

        expect(session.requests).toHaveLength(4)
    })
})

describe('closing', () => {
    it('settles every read still awaited, though a consumer still claims it', async () => {
        const session = sessionOver()
        session.refresh.claim(['users/x/a'])
        let refreshed = false
        session.refresh.refresh(['users/x/a'], {force: true}).then(() => refreshed = true)

        session.refresh.close()
        await settled()

        expect(refreshed).toBe(true)
    })
})

// Lets the reads a settled request was awaited by schedule what follows them.
const settled = () => new Promise(resolve => setTimeout(resolve, 0))

// A session holding asset evidence, the versions endpoint answered by the test, and a clock it moves.
const sessionOver = ({catalogue = {}} = {}) => {
    let now = 0
    let timers = []
    let visible = true
    const state = {assetEvidence: {}, assetCatalogue: catalogue, credentials: {}}
    const changes = new Subject()
    const wakeups = new Subject()
    const requests = []
    const refresh = new AssetRefresh({
        session: () => state,
        sessionChanges$: changes,
        updateEvidence: update => {
            state.assetEvidence = update(state.assetEvidence)
            changes.next()
        },
        loadVersions$: ids => {
            const response = new Subject()
            requests.push({ids, response})
            return response
        },
        wakeups$: wakeups,
        visible: () => visible,
        clock: {
            now: () => now,
            setTimeout: (callback, ms) => {
                const timer = {at: now + ms, callback}
                timers.push(timer)
                return timer
            },
            clearTimeout: timer => timers = timers.filter(other => other !== timer)
        }
    })
    const advance = ms => {
        const until = now + ms
        for (;;) {
            const due = timers.filter(({at}) => at <= until).sort((a, b) => a.at - b.at)[0]
            if (!due) {
                break
            }
            timers = timers.filter(timer => timer !== due)
            now = due.at
            due.callback()
        }
        now = until
    }
    return {
        refresh,
        requests,
        advance,
        evidence: id => state.assetEvidence[id],
        authority: id => assetAuthority(state.assetEvidence[id], {now}),
        // Answers a request, the latest by default, with a version - or a failure - for each asset named.
        answer: (versions, index = requests.length - 1) => {
            const {ids, response} = requests[index]
            response.next({assets: ids.map(id => {
                const answer = versions[id]
                return typeof answer === 'object' ? {id, ...answer} : {id, version: answer, type: 'IMAGE'}
            })})
            response.complete()
        },
        fail: (index = requests.length - 1) => requests[index].response.error(new Error('Service unavailable')),
        hide: () => visible = false,
        show: () => {
            visible = true
            wakeups.next()
        },
        catalogue: assets => {
            state.assetCatalogue = assets
            changes.next()
        },
        replaceCredentials: () => {
            state.credentials = {}
            state.assetEvidence = {}
            changes.next()
        }
    }
}
