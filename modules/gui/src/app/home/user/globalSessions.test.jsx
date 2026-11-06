// The admin panel of every user's sessions. The panel and the list reach the store and the DOM in ways
// a unit test cannot serve, so they are passthroughs; the HOCs are replaced by the props they would
// inject.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/subscription', () => ({withSubscriptions: () => component => component}))
vi.mock('~/widget/activation/activatable', () => ({withActivatable: () => component => component}))
vi.mock('~/apiRegistry', () => ({default: {sessions: {globalSessions$: vi.fn()}}}))
vi.mock('~/widget/icon', () => ({Icon: ({name}) => <span className={name}/>}))
vi.mock('~/widget/noData', () => ({NoData: ({message}) => <div className='no-data'>{message}</div>}))
vi.mock('./userSessionList', () => ({
    UserSessionList: ({global, sessions, onStopped}) =>
        <div className='list' data-global={String(global)}>
            {sessions.map(session =>
                <button key={session.id} className='session' onClick={() => onStopped(session)}>{session.id}</button>
            )}
        </div>
}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div>{children}</div>
    Panel.Header = ({title, label}) => <h1>{title}<span className='label'>{label}</span></h1>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div className='buttons'>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Close = ({onClick}) => <button className='close' onClick={onClick}/>
    Panel.Buttons = Buttons
    return {Panel}
})

import api from '~/apiRegistry'
import {setLanguage, TranslationProvider} from '~/translate'

import {GlobalSessions} from './globalSessions'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the global sessions panel', () => {
    let mounted

    const render = () => {
        const subscriptions = []
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <GlobalSessions
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
        vi.mocked(api.sessions.globalSessions$).mockReset()
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    const alices = {id: 's1', username: 'alice'}
    const bobs = {id: 's2', username: 'bob'}

    const listed = container =>
        [...container.querySelectorAll('.session')].map(({textContent}) => textContent)

    it('lists every user\'s sessions, counted in the header', () => {
        vi.mocked(api.sessions.globalSessions$).mockReturnValue(of({sessions: [alices, bobs]}))
        const container = render()

        expect(container.querySelector('.list').dataset.global).toBe('true')
        expect(listed(container)).toEqual(['s1', 's2'])
        expect(container.querySelector('h1').textContent).toBe('Global sessions2 active')
    })

    it('offers no way to start sessions or stop them all', () => {
        vi.mocked(api.sessions.globalSessions$).mockReturnValue(of({sessions: [alices]}))
        const buttons = render().querySelector('.buttons').querySelectorAll('button')

        expect([...buttons].map(({className}) => className)).toEqual(['close'])
    })

    it('drops a session from the list once it is stopped', () => {
        vi.mocked(api.sessions.globalSessions$).mockReturnValue(of({sessions: [alices, bobs]}))
        const container = render()

        act(() => container.querySelector('.session').click())

        expect(listed(container)).toEqual(['s2'])
    })

    it('says so when the sessions cannot be loaded', () => {
        vi.mocked(api.sessions.globalSessions$).mockReturnValue(throwError(() => new Error('down')))

        expect(render().querySelector('.no-data').textContent).toBe('Could not load the sessions.')
    })
})
