// Whose usage the statistics show, and how. connect() is mocked away, so the stream prop it would inject
// subscribes directly. The label and the sideways scrolling are passthroughs, and each tooltip renders
// its content beside the page, in the order of the months.

import {act} from 'react'
import {createPortal} from 'react-dom'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/apiRegistry', () => ({default: {sessions: {usage$: vi.fn(), userUsage$: vi.fn()}}}))
vi.mock('~/widget/icon', () => ({Icon: ({name}) => <span className={name}/>}))
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/widget', () => ({
    Widget: ({label, children}) => <div><label>{label}</label><div className='content'>{children}</div></div>
}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) =>
        <>
            {children}
            {createPortal(<div data-tooltip>{msg}</div>, document.body)}
        </>
}))

import api from '~/apiRegistry'
import {setLanguage, TranslationProvider} from '~/translate'

import {UsageStatistics} from './usageStatistics'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

const stream = (_name, stream$, onNext, onError) => {
    stream$?.subscribe({next: onNext, error: onError})
    return {active: false}
}

describe('the usage statistics', () => {
    let mounted

    beforeEach(() => {
        mounted = []
        vi.mocked(api.sessions.usage$).mockReset().mockReturnValue(of(usage))
        vi.mocked(api.sessions.userUsage$).mockReset().mockReturnValue(of(usage))
    })
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('shows the current user their own usage when no user is named', () => {
        render()

        expect(api.sessions.usage$).toHaveBeenCalled()
        expect(api.sessions.userUsage$).not.toHaveBeenCalled()
    })

    it('shows the named user\'s usage', () => {
        render({username: 'bob'})

        expect(api.sessions.userUsage$).toHaveBeenCalledWith('bob')
        expect(api.sessions.usage$).not.toHaveBeenCalled()
    })

    it('lists the totals of each month, as reported', () => {
        expect(rows(render())).toEqual([
            ['Aug 2026', '12', '$3.20', '20% / 90%', '40% / 60%', '1.00 kB/s'],
            ['Jun 2026', '3', '$0.06', '5% / 10%', '20% / 30%', '—']
        ])
    })

    // By tag, as the user picks a type everywhere else; an untagged type by its name.
    it('shows a month\'s usage per instance type when it is hovered', () => {
        render()

        expect(rows(tooltips()[0])).toEqual([
            ['t1', '10', '$0.20', '12% / 96%', '35% / 50%', '1.00 kB/s'],
            ['m3.medium', '2', '—', '50% / 80%', '60% / 70%', '—']
        ])
    })

    it('heads each column', () => {
        const headers = [...render().querySelectorAll('th')].map(({textContent}) => textContent)

        expect(headers).toEqual(['Month', 'Hours', 'Cost', 'CPU (avg/max)', 'RAM (avg/max)', 'Network'])
    })

    it('says so when nothing has been recorded', () => {
        vi.mocked(api.sessions.usage$).mockReturnValue(of({months: []}))

        expect(content(render())).toBe('No usage recorded')
    })

    it('says so when the usage cannot be loaded', () => {
        vi.mocked(api.sessions.usage$).mockReturnValue(throwError(() => new Error('down')))

        expect(content(render())).toBe('Could not load usage data')
    })

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
})

const metric = (avg, max) => ({avg, max})

const usage = {
    months: [{
        month: '2026-08',
        overall: {hours: 12, cost: 3.2, cpu: metric(20, 90), ram: metric(40, 60), gpu: null, netBytesPerS: 1000},
        byInstanceType: [
            {name: 't3a.small', tag: 't1', hours: 10, cost: 0.2, cpu: metric(12.4, 96), ram: metric(35, 50), gpu: null, netBytesPerS: 1000},
            {name: 'm3.medium', tag: null, hours: 2, cost: null, cpu: metric(50, 80), ram: metric(60, 70), gpu: null, netBytesPerS: null}
        ]
    }, {
        month: '2026-06',
        overall: {hours: 3, cost: 0.06, cpu: metric(5, 10), ram: metric(20, 30), gpu: null, netBytesPerS: null},
        byInstanceType: [
            {name: 't3a.small', tag: 't1', hours: 3, cost: 0.06, cpu: metric(5, 10), ram: metric(20, 30), gpu: null, netBytesPerS: null}
        ]
    }]
}

const rows = element => [...element.querySelector('table').querySelectorAll(':scope > tbody > tr')]
    .map(row => [...row.querySelectorAll('td')].map(({textContent}) => textContent))
const tooltips = () => [...document.querySelectorAll('[data-tooltip]')]
const content = container => container.querySelector('.content').textContent
