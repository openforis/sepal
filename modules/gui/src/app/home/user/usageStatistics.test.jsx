// Whose usage the statistics show, and how. connect() is mocked away, so the stream prop it would inject
// subscribes directly.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/apiRegistry', () => ({default: {sessions: {usage$: vi.fn(), userUsage$: vi.fn()}}}))
vi.mock('~/widget/icon', () => ({Icon: ({name}) => <span className={name}/>}))

import api from '~/apiRegistry'
import {setLanguage, TranslationProvider} from '~/translate'

import {UsageStatistics} from './usageStatistics'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

const stream = (_name, stream$, onNext, onError) => {
    stream$?.subscribe({next: onNext, error: onError})
    return {active: false}
}

const metric = (avg, max) => ({avg, max})

const usage = {
    days: 30,
    overall: {hours: 12, cost: 3.2, cpu: metric(20, 90), ram: metric(40, 60), gpu: null, netBytesPerS: 1000},
    byInstanceType: [
        {name: 't1', hours: 10, cost: 0.2, cpu: metric(12.4, 96), ram: metric(35, 50), gpu: null, netBytesPerS: 1000},
        {name: 'm4', hours: 2, cost: null, cpu: metric(50, 80), ram: metric(60, 70), gpu: null, netBytesPerS: null}
    ]
}

describe('the usage statistics', () => {
    let mounted

    const render = props => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <UsageStatistics stream={stream} {...props}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    beforeEach(() => {
        mounted = []
        vi.mocked(api.sessions.usage$).mockReset().mockReturnValue(of(usage))
        vi.mocked(api.sessions.userUsage$).mockReset().mockReturnValue(of(usage))
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('shows the current user their own usage when no user is named', () => {
        render()

        expect(api.sessions.usage$).toHaveBeenCalledWith(30)
        expect(api.sessions.userUsage$).not.toHaveBeenCalled()
    })

    it('shows the named user\'s usage', () => {
        render({username: 'bob'})

        expect(api.sessions.userUsage$).toHaveBeenCalledWith('bob', 30)
        expect(api.sessions.usage$).not.toHaveBeenCalled()
    })

    it('lists each instance type with its cost, then all instances together', () => {
        const rows = [...render().querySelectorAll('tbody tr')]
            .map(row => [...row.querySelectorAll('td')].map(({textContent}) => textContent))

        expect(rows).toEqual([
            ['t1', '10', '$0.20', '12% / 96%', '35% / 50%', '1.00 kB/s'],
            ['m4', '2', '—', '50% / 80%', '60% / 70%', '—'],
            ['All instances', '12', '$3.20', '20% / 90%', '40% / 60%', '1.00 kB/s']
        ])
    })

    it('heads each column', () => {
        const headers = [...render().querySelectorAll('th')].map(({textContent}) => textContent)

        expect(headers).toEqual(['Instance type', 'Hours', 'Cost', 'CPU (avg/max)', 'RAM (avg/max)', 'Network'])
    })

    it('sets the total apart from the instance types', () => {
        const rows = [...render().querySelectorAll('tbody tr')]

        expect(rows.map(({className}) => Boolean(className))).toEqual([false, false, true])
    })

    it('says so when nothing has been recorded', () => {
        vi.mocked(api.sessions.usage$).mockReturnValue(of({days: 30, overall: null, byInstanceType: []}))

        expect(render().textContent).toBe('No usage data recorded yet')
    })

    it('says so when the usage cannot be loaded', () => {
        vi.mocked(api.sessions.usage$).mockReturnValue(throwError(() => new Error('down')))

        expect(render().textContent).toBe('Could not load usage data')
    })
})
