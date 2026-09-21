// What the session list actually renders for one session. The row widgets below reach the store and
// the DOM in ways a unit test cannot serve, so they are passthroughs — what is under test is the
// text this component hands them.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/store', () => ({select: () => null}))
vi.mock('~/action-builder', () => ({actionBuilder: () => ({set: () => ({dispatch: () => {}})})}))
vi.mock('~/user', () => ({stopCurrentUserSession$: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/listItem', () => ({ListItem: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/noData', () => ({NoData: ({message}) => <div>{message}</div>}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: ({title, description, timestampFootnote, removeMessage, editDisabled, removePending}) =>
        <div className='session' data-edit-disabled={editDisabled} data-remove-pending={removePending}>
            <div>{title}</div>
            <div>{description}</div>
            <div className='footnote'>{timestampFootnote}</div>
            <div className='remove-message'>{removeMessage}</div>
        </div>
}))

import {setLanguage, TranslationProvider} from '~/translate'

import {UserSessions} from './userSessions'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// TranslationProvider resolves the locale through localStorage.
setLanguage('en')

const session = overrides => ({
    id: 's1',
    instanceType: {name: 't3a.small', tag: 't1', description: '1 CPU, 2 GiB', hourlyCost: 0.0204, gpuCount: 0},
    creationTime: '2026-08-17T07:17:29.000Z',
    costSinceCreation: 0.04,
    apps: [],
    terminals: 0,
    verdict: 'unused',
    usage: {cpuPct: 12.4, ramPct: 34.6, gpuPct: null, netBytesPerS: 1234},
    expiry: {state: 'NONE', timeoutTime: '2026-08-17T09:22:26.000Z', notifiedTime: null, closeTime: null},
    ...overrides
})

describe('the session list', () => {
    let mounted

    // connect() is mocked away, so the stream prop it would inject is stubbed here: a name is
    // active while its session is being stopped, nothing else is.
    const render = (sessions, {stopping = []} = {}) => {
        const stream = name => ({active: stopping.some(id => name === `STOP_USER_SESSION_${id}`)})
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <UserSessions sessions={sessions} stream={stream}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    beforeEach(() => mounted = [])
    afterEach(() => mounted.forEach(unmount => unmount()))

    // The number leads (it is what the SSH menu accepts), then the instance's own name, then its
    // type — the same name the expiry notification, the email and its management page show.
    it('numbers each instance, names it, and prices it by the hour', () => {
        const text = render([
            session({id: 's1', name: 'humble-robin'}),
            session({id: 's2', name: 'lunar-owl'}),
        ]).textContent
        expect(text).toContain('1: humble-robin - t1 ($0.02/h)')
        expect(text).toContain('2: lunar-owl - t1 ($0.02/h)')
    })

    it('falls back to number and type for a session with no name', () => {
        const text = render([session({id: 's1', name: null})]).textContent
        expect(text).toContain('1: t1 ($0.02/h)')
    })

    // Under the relative start time, not in a column of its own.
    it('puts the cost so far in the timestamp footnote', () => {
        const container = render([session()])
        expect(container.querySelector('.footnote').textContent).toBe('$0.04')
    })

    it('reports the sampled usage and the verdict', () => {
        expect(render([session()]).textContent).toContain('CPU 12% · NET 1.23 kB/s · RAM 35% — unused')
    })

    it('says so when there is no usage sample', () => {
        expect(render([session({usage: null, verdict: 'unknown'})]).textContent)
            .toContain('No usage data')
    })

    it('lists the apps as bullets', () => {
        const running = session({
            apps: [{path: '/sandbox/jupyter', label: 'Jupyter'}, {path: '/sandbox/shiny/foo', label: null}]
        })
        const container = render([running])
        expect([...container.querySelectorAll('li')].map(({textContent}) => textContent))
            .toEqual(['Jupyter', '/sandbox/shiny/foo'])
    })

    it('says nothing about terminal sessions, whatever the count', () => {
        const running = session({
            apps: [{path: '/sandbox/jupyter', label: 'Jupyter'}],
            terminals: 2
        })
        const {textContent} = render([running])
        expect(textContent).toContain('Jupyter')
        expect(textContent).not.toContain('Terminal sessions')
    })

    it('shows nothing at all for a session running only terminals', () => {
        const container = render([session({terminals: 1})])
        expect(container.querySelectorAll('li')).toHaveLength(0)
        expect(container.textContent).not.toContain('Terminal sessions')
    })

    it('lists nothing when nothing is running', () => {
        const container = render([session()])
        expect(container.querySelectorAll('li')).toHaveLength(0)
        expect(container.textContent).not.toContain('Terminal sessions')
    })

    // The confirmation is the last thing between a user and an instance they cannot get back, so it
    // says which one — by the name the list, the SSH menu and the expiry notification all use.
    it('names the session in the stop confirmation', () => {
        const container = render([session({name: 'humble-robin'})])
        expect(container.querySelector('.remove-message').textContent)
            .toBe('You are stopping session humble-robin.')
    })

    it('still names it when warning about what is running on it', () => {
        const running = session({name: 'humble-robin', apps: [{path: '/sandbox/jupyter', label: 'Jupyter'}]})
        const message = render([running]).querySelector('.remove-message').textContent
        expect(message).toContain('You are stopping session humble-robin.')
        expect(message).toContain('will be closed')
    })

    it('falls back to the list label when confirming a session with no name', () => {
        const container = render([session({name: null})])
        expect(container.querySelector('.remove-message').textContent)
            .toBe('You are stopping session 1: t1.')
    })

    it('shows the deadline as a time and a distance', () => {
        // 09:22 UTC, and a relative distance moment computes against the real clock.
        const text = render([session()]).textContent
        expect(text).toMatch(/Keep-alive until \d{1,2}:\d{2} (AM|PM) \((in a|in \d+|a|\d+).* (minutes?|hours?|days?|months?|years?)( ago)?\)/)
    })

    // Stopping takes as long as the worker takes to answer, and the row only leaves the list on that
    // answer — until then nothing on it may be clicked again, and the stop button says it is busy.
    it('disables the buttons and marks the stop button pending while a session is being stopped', () => {
        const container = render([session({id: 's1'})], {stopping: ['s1']})
        const row = container.querySelector('.session')
        expect(row.dataset.editDisabled).toBe('true')
        expect(row.dataset.removePending).toBe('true')
    })

    it('leaves the other sessions active while one is being stopped', () => {
        const container = render([session({id: 's1'}), session({id: 's2'})], {stopping: ['s1']})
        const [, other] = container.querySelectorAll('.session')
        expect(other.dataset.editDisabled).toBe('false')
        expect(other.dataset.removePending).toBe('false')
    })

    it('adds the close time once a notified session is under enforcement', () => {
        const notified = session({
            expiry: {
                state: 'NOTIFIED',
                timeoutTime: '2026-08-17T09:22:26.000Z',
                notifiedTime: '2026-08-17T09:23:00.000Z',
                closeTime: '2026-08-17T10:23:00.000Z'
            }
        })
        expect(render([notified]).textContent).toMatch(/stops at \d{1,2}:\d{2} (AM|PM)/)
    })
})
