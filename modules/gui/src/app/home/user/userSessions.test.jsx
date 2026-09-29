// What the sessions panel does around its list: starting a new session through the instance picker, and
// stopping them all. The
// panel, list and picker reach the store and the DOM in ways a unit test cannot serve, so they are
// passthroughs; the HOCs are replaced by the props they would inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/subscription', () => ({withSubscriptions: () => component => component}))
vi.mock('~/widget/activation/activatable', () => ({withActivatable: () => component => component}))
vi.mock('~/store', () => ({select: () => null}))
vi.mock('~/user', () => ({startCurrentUserSession$: vi.fn(), stopCurrentUserSession$: vi.fn()}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: vi.fn()}}))
vi.mock('~/widget/sessionMonitor', () => ({refreshSessions: vi.fn()}))
vi.mock('./userSessionList', () => ({
    UserSessionList: ({stoppingAll}) => <div className='list' data-stopping-all={String(stoppingAll)}/>
}))
vi.mock('./userSession', () => ({UserSession: () => <div className='session-editor'/>}))
// Confirms at once; what it would ask is on the element, for the confirmation tests to read.
vi.mock('~/widget/modalConfirmationButton', () => ({
    ModalConfirmationButton: ({label, message, disabled, busy, onConfirm, children}) =>
        <div className='stop-all' data-disabled={String(disabled)} data-busy={String(busy)}>
            <button onClick={onConfirm}>{label}</button>
            <div className='confirmation'>{message}{children}</div>
        </div>
}))
vi.mock('../body/apps/instancePicker', () => ({
    InstancePicker: ({app, onConfirm, onCancel}) =>
        <div className='picker' data-app={String(app)}>
            <button className='pick' onClick={() => onConfirm({instanceType: 'M6aXlarge'})}/>
            <button className='cancel' onClick={onCancel}/>
        </div>
}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div>{children}</div>
    Panel.Header = ({title, label}) => <h1>{title}<span className='label'>{label}</span></h1>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Extra = ({children}) => <div>{children}</div>
    Buttons.Close = ({onClick}) => <button className='close' onClick={onClick}/>
    Buttons.Add = ({label, onClick, busy}) => <button className='add' data-busy={String(busy)} onClick={onClick}>{label}</button>
    Panel.Buttons = Buttons
    return {Panel}
})

import {setLanguage, TranslationProvider} from '~/translate'
import {startCurrentUserSession$, stopCurrentUserSession$} from '~/user'
import {Notifications} from '~/widget/notifications'

import {UserSessions} from './userSessions'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the sessions panel', () => {
    let mounted

    const render = ({starting = false, stopping = false, selectedSessionId, sessions = []} = {}) => {
        // connect() is mocked away, so the stream prop it would inject subscribes directly.
        const active = {START_USER_SESSION: starting, STOP_ALL_USER_SESSIONS: stopping}
        const stream = (name, stream$, onNext, onError) => {
            stream$?.subscribe({next: onNext, error: onError})
            return {active: active[name]}
        }
        const subscriptions = []
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <UserSessions
                    stream={stream}
                    selectedSessionId={selectedSessionId}
                    sessions={sessions}
                    activatable={{deactivate: vi.fn()}}
                    addSubscription={subscription => subscriptions.push(subscription)}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            subscriptions.forEach(subscription => subscription.unsubscribe())
            container.remove()
        })
        return container
    }

    beforeEach(() => {
        mounted = []
        vi.mocked(startCurrentUserSession$).mockReset()
        vi.mocked(stopCurrentUserSession$).mockReset()
        vi.mocked(Notifications.error).mockReset()
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('lists the sessions', () => {
        const container = render()

        expect(container.querySelector('h1').firstChild.textContent).toBe('Sessions')
        expect(container.querySelector('.list')).not.toBeNull()
    })

    it('counts the active sessions in the header', () => {
        const container = render({sessions: [{id: 's1', apps: []}, {id: 's2', apps: []}]})

        expect(container.querySelector('h1 .label').textContent).toBe('2 active')
    })

    it('shows the selected session for editing instead of the list', () => {
        const container = render({selectedSessionId: 's1'})

        expect(container.querySelector('.session-editor')).not.toBeNull()
        expect(container.querySelector('.list')).toBeNull()
    })

    it('picks a new instance, not one for an app, when adding a session', () => {
        const container = render()

        act(() => container.querySelector('.add').click())

        expect(container.querySelector('.picker').dataset.app).toBe('undefined')
        expect(container.querySelector('.list')).toBeNull()
    })

    it('starts a session of the picked instance type and returns to the list', () => {
        vi.mocked(startCurrentUserSession$).mockReturnValue(of({id: 's2'}))
        const container = render()
        act(() => container.querySelector('.add').click())

        act(() => container.querySelector('.pick').click())

        expect(startCurrentUserSession$).toHaveBeenCalledWith('M6aXlarge')
        expect(container.querySelector('.picker')).toBeNull()
        expect(container.querySelector('.list')).not.toBeNull()
    })

    it('starts nothing when the pick is cancelled', () => {
        const container = render()
        act(() => container.querySelector('.add').click())

        act(() => container.querySelector('.cancel').click())

        expect(startCurrentUserSession$).not.toHaveBeenCalled()
        expect(container.querySelector('.list')).not.toBeNull()
    })

    it('tells the user when the session could not be started', () => {
        const error = new Error('budget exceeded')
        vi.mocked(startCurrentUserSession$).mockReturnValue(throwError(() => error))
        const container = render()
        act(() => container.querySelector('.add').click())

        act(() => container.querySelector('.pick').click())

        expect(Notifications.error).toHaveBeenCalledWith({message: 'Could not start session.', error})
    })

    // No capacity for the type in SEPAL's region, or not offered there: nothing SEPAL can fix, and
    // the user can pick another type or wait.
    it('blames AWS when it cannot provide the instance type', () => {
        vi.mocked(startCurrentUserSession$).mockReturnValue(throwError(() =>
            ({status: 503, response: {code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'}})))
        const container = render()
        act(() => container.querySelector('.add').click())

        act(() => container.querySelector('.pick').click())

        expect(Notifications.error).toHaveBeenCalledWith({
            title: 'Could not start session.',
            message: expect.stringMatching(/^Amazon Web Services \(AWS\) cannot provide this instance type/)
        })
    })

    it('marks the add button busy while a session is being started', () => {
        const container = render({starting: true})

        expect(container.querySelector('.add').dataset.busy).toBe('true')
    })

    it('offers to start a session', () => {
        expect(render().querySelector('.add').textContent).toBe('Start')
    })

    describe('stop all', () => {
        const humbleRobin = {id: 's1', name: 'humble-robin', instanceType: {tag: 't1'}, apps: [{path: '/sandbox/jupyter', label: 'Jupyter'}]}
        const lunarOwl = {id: 's2', name: 'lunar-owl', instanceType: {tag: 'm2'}, apps: []}

        const stopAll = container => act(() => container.querySelector('.stop-all button').click())

        it('stops every session', () => {
            vi.mocked(stopCurrentUserSession$).mockReturnValue(of(null))
            const container = render({sessions: [humbleRobin, lunarOwl]})

            stopAll(container)

            expect(vi.mocked(stopCurrentUserSession$).mock.calls).toEqual([[humbleRobin], [lunarOwl]])
            expect(Notifications.error).not.toHaveBeenCalled()
        })

        // The confirmation is the last thing between a user and instances they cannot get back.
        it('asks first, naming each instance and what runs on it', () => {
            const confirmation = render({sessions: [humbleRobin, lunarOwl]}).querySelector('.confirmation')

            expect(confirmation.textContent).toContain('You are stopping all your instances (2).')
            expect([...confirmation.querySelectorAll('li')].map(({textContent}) => textContent))
                .toEqual(['humble-robin — Jupyter', 'lunar-owl'])
        })

        it('keeps stopping the others when one fails, and says so once', () => {
            const error = new Error('gone')
            vi.mocked(stopCurrentUserSession$)
                .mockReturnValueOnce(throwError(() => error))
                .mockReturnValueOnce(of(null))
            const container = render({sessions: [humbleRobin, lunarOwl]})

            stopAll(container)

            expect(stopCurrentUserSession$).toHaveBeenCalledWith(lunarOwl)
            expect(Notifications.error).toHaveBeenCalledTimes(1)
            expect(Notifications.error).toHaveBeenCalledWith({message: 'Could not stop all sessions.', error})
        })

        it('is disabled when there is nothing to stop', () => {
            expect(render().querySelector('.stop-all').dataset.disabled).toBe('true')
        })

        it('is busy while the sessions are being stopped', () => {
            const container = render({sessions: [humbleRobin], stopping: true})

            expect(container.querySelector('.stop-all').dataset.busy).toBe('true')
        })

        // Nothing on an instance that is on its way out may be used.
        it('tells the list, so no session can be used meanwhile', () => {
            const container = render({sessions: [humbleRobin], stopping: true})

            expect(container.querySelector('.list').dataset.stoppingAll).toBe('true')
        })
    })
})
