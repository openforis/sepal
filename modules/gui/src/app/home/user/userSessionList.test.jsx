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
vi.mock('~/widget/listItem', () => ({
    ListItem: ({children, expansion}) => <div>{children}<div className='expansion'>{expansion}</div></div>
}))
vi.mock('~/widget/noData', () => ({NoData: ({message}) => <div>{message}</div>}))
vi.mock('~/widget/tag', () => ({Tag: ({label}) => <span className='pill'>{label}</span>}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: ({title, description, removeMessage, editDisabled, removePending, copyValue, copyDisabled}) =>
        <div className='session' data-edit-disabled={editDisabled} data-remove-pending={removePending}
            data-copy-value={copyValue ?? ''} data-copy-disabled={copyDisabled}>
            <div className='title'>{title}</div>
            <div className='description'>{description}</div>
            <div className='remove-message'>{removeMessage}</div>
        </div>
}))

import {setLanguage, TranslationProvider} from '~/translate'

import {UserSessionList} from './userSessionList'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// TranslationProvider resolves the locale through localStorage.
setLanguage('en')

const session = overrides => ({
    id: 's1',
    instanceType: {name: 't3a.small', tag: 't1', cpuCount: 1, gpuCount: 0, ramGiB: 2, hourlyCost: 0.0204},
    sshLogin: 'alice+humble-robin@ssh.sepal.io',
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
                <UserSessionList sessions={sessions} stream={stream}/>
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

    // Titled by the name the expiry notification, the email and its management page show — no list
    // number, which is the SSH menu's business.
    it('titles each instance by its name', () => {
        const titles = render([
            session({id: 's1', name: 'humble-robin'}),
            session({id: 's2', name: 'lunar-owl'}),
        ]).querySelectorAll('.title > div')
        expect([...titles].map(({firstChild}) => firstChild.textContent)).toEqual(['humble-robin', 'lunar-owl'])
    })

    it('puts the type on the line below the name', () => {
        const [, type] = render([session({name: 'humble-robin'})]).querySelector('.title > div').children
        expect(type.firstChild.textContent).toBe('t1')
    })

    it('titles a session with no name by its type alone', () => {
        const title = render([session({name: null})]).querySelector('.title > div')
        expect(title.children).toHaveLength(1)
        expect(title.firstChild.firstChild.textContent).toBe('t1')
    })

    // One pill under the label, in the title: capacity first, then what it costs, separated the
    // way the usage line separates its metrics.
    it('sizes and prices the instance in a pill under its label', () => {
        const pill = render([session()]).querySelector('.title .pill')
        expect(pill.textContent).toBe('1 CPU · 2 GB · $0.02/h')
    })

    it('counts the GPUs of a GPU instance', () => {
        const gpu = session({
            instanceType: {name: 'g5.xlarge', tag: 'g4', cpuCount: 4, gpuCount: 1, ramGiB: 16, hourlyCost: 1.123}
        })
        expect(render([gpu]).querySelector('.title .pill').textContent).toBe('4 CPU · 1 GPU · 16 GB · $1.12/h')
    })

    // Each value under its own label, in the expansion under the row rather than in its description.
    const stats = container => [...container.querySelectorAll('.expansion > div > div')]
        .map(stat => [...stat.children].map(({textContent}) => textContent))

    it('reports the sampled usage, the verdict and the cost so far under the row', () => {
        expect(stats(render([session({expiry: null})]))).toEqual([
            ['CPU', '12%'],
            ['RAM', '35%'],
            ['NET', '1.23 kB/s'],
            ['Activity', 'unused'],
            ['Cost', '$0.04']
        ])
    })

    it('says so when there is no usage sample', () => {
        expect(stats(render([session({usage: null, verdict: 'unknown', expiry: null})])))
            .toEqual([['Usage', 'No data'], ['Cost', '$0.04']])
    })

    it('names the apps on the row', () => {
        const running = session({
            apps: [{path: '/sandbox/jupyter', label: 'Jupyter'}, {path: '/sandbox/shiny/foo', label: null}]
        })
        expect(render([running]).querySelector('.description').textContent)
            .toBe('Jupyter · /sandbox/shiny/foo')
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
        expect(container.querySelector('.description').textContent).toBe('')
        expect(container.textContent).not.toContain('Terminal sessions')
    })

    // The report builds the login: the gateway's address is configuration the GUI does not have.
    it('copies the SSH login the report gives for the instance', () => {
        const row = render([session({sshLogin: 'alice+humble-robin@ssh.sepal.io'})]).querySelector('.session')
        expect(row.dataset.copyValue).toBe('alice+humble-robin@ssh.sepal.io')
        expect(row.dataset.copyDisabled).toBe('false')
    })

    it('has no SSH login to copy when the report gives none', () => {
        const row = render([session({sshLogin: null})]).querySelector('.session')
        expect(row.dataset.copyDisabled).toBe('true')
    })

    it('disables copying the SSH login while the session is being stopped', () => {
        const row = render([session({id: 's1'})], {stopping: ['s1']}).querySelector('.session')
        expect(row.dataset.copyDisabled).toBe('true')
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

    it('falls back to the type when confirming a session with no name', () => {
        const container = render([session({name: null})])
        expect(container.querySelector('.remove-message').textContent)
            .toBe('You are stopping session t1.')
    })

    it('shows the deadline as a time and a distance', () => {
        // 09:22 UTC, and a relative distance moment computes against the real clock.
        const [label, value] = stats(render([session()])).at(-1)
        expect(label).toBe('Keep alive until')
        expect(value).toMatch(/^\d{1,2}:\d{2} (AM|PM) \((in a|in \d+|a|\d+).* (minutes?|hours?|days?|months?|years?)( ago)?\)$/)
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
        const [label, value] = stats(render([notified])).at(-1)
        expect(label).toBe('Stops at')
        expect(value).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/)
    })

    it('shows no close time in notify mode, where nothing will close the session', () => {
        const notified = session({
            expiry: {
                state: 'NOTIFIED',
                timeoutTime: '2026-08-17T09:22:26.000Z',
                notifiedTime: '2026-08-17T09:23:00.000Z',
                closeTime: null
            }
        })
        expect(stats(render([notified])).map(([label]) => label)).not.toContain('Stops at')
    })
})
