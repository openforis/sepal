// What the sessions panel does around its list: starting a new session through the instance picker. The
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
vi.mock('~/user', () => ({startCurrentUserSession$: vi.fn()}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: vi.fn()}}))
vi.mock('~/widget/sessionMonitor', () => ({refreshSessions: vi.fn()}))
vi.mock('./userSessionList', () => ({UserSessionList: () => <div className='list'/>}))
vi.mock('./userSession', () => ({UserSession: () => <div className='session-editor'/>}))
vi.mock('../body/apps/instancePicker', () => ({
    InstancePicker: ({app, onConfirm, onCancel}) =>
        <div className='picker' data-app={String(app)}>
            <button className='pick' onClick={() => onConfirm({instanceType: 'M6aXlarge'})}/>
            <button className='cancel' onClick={onCancel}/>
        </div>
}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div>{children}</div>
    Panel.Header = ({title}) => <h1>{title}</h1>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Extra = ({children}) => <div>{children}</div>
    Buttons.Close = ({onClick}) => <button className='close' onClick={onClick}/>
    Buttons.Add = ({onClick, busy}) => <button className='add' data-busy={String(busy)} onClick={onClick}/>
    Panel.Buttons = Buttons
    return {Panel}
})

import {setLanguage, TranslationProvider} from '~/translate'
import {startCurrentUserSession$} from '~/user'
import {Notifications} from '~/widget/notifications'

import {UserSessions} from './userSessions'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the sessions panel', () => {
    let mounted

    const render = ({starting = false, selectedSessionId} = {}) => {
        // connect() is mocked away, so the stream prop it would inject subscribes directly.
        const stream = (_name, stream$, onNext, onError) => {
            stream$?.subscribe({next: onNext, error: onError})
            return {active: starting}
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
        vi.mocked(Notifications.error).mockReset()
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('lists the sessions', () => {
        const container = render()

        expect(container.querySelector('h1').textContent).toBe('Sessions')
        expect(container.querySelector('.list')).not.toBeNull()
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

    it('marks the add button busy while a session is being started', () => {
        const container = render({starting: true})

        expect(container.querySelector('.add').dataset.busy).toBe('true')
    })
})
