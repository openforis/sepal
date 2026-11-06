// Whose usage the statistics show, and how. connect() is mocked away, so the stream prop it would inject
// subscribes directly. The label and the sideways scrolling are passthroughs, and each tooltip renders
// its content beside the page, in the order of the months.

import {act} from 'react'
import {createPortal} from 'react-dom'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => component => component}))
vi.mock('~/apiRegistry', () => ({default: {sessions: {usage$: vi.fn(), userUsage$: vi.fn(), globalUsage$: vi.fn()}}}))
vi.mock('~/widget/icon', () => ({Icon: ({name}) => <span className={name}/>}))
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => <div>{children}</div>}))
vi.mock('~/widget/widget', () => ({
    Widget: ({label, tooltip, children}) =>
        <div>
            <label>{label}</label>
            <div className='content'>{children}</div>
            <div data-widget-tooltip>{tooltip}</div>
        </div>
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

import {USAGE_COLORS} from './usageColors'
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
        vi.mocked(api.sessions.globalUsage$).mockReset().mockReturnValue(of(usage))
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

    it('shows every user\'s usage when global', () => {
        render({global: true})

        expect(api.sessions.globalUsage$).toHaveBeenCalled()
        expect(api.sessions.usage$).not.toHaveBeenCalled()
        expect(api.sessions.userUsage$).not.toHaveBeenCalled()
    })

    it('lists the totals of each month, as reported', () => {
        expect(rows(render())).toEqual([
            ['Aug 2026', '12', '$ 3.20', 'avg 20%, max 90%', 'avg 40%, max 60%', 'Not available', '1.00 kB/s'],
            ['Jun 2026', '3', '$ 0.06', 'avg 5%, max 10%', 'avg 20%, max 30%', 'Not available', '—']
        ])
    })

    // By tag, as the user picks a type everywhere else; an untagged type by its name.
    it('shows a month\'s usage per instance type when it is hovered', () => {
        render()

        expect(rows(tooltips()[0])).toEqual([
            ['t1', '10', '$ 0.20', 'avg 12%, max 96%', 'avg 35%, max 50%', 'Not available', '1.00 kB/s'],
            ['m3.medium', '2', '—', 'avg 50%, max 80%', 'avg 60%, max 70%', 'Not available', '—']
        ])
    })

    it('heads each column', () => {
        const headers = [...render().querySelectorAll('th')].map(({textContent}) => textContent)

        expect(headers).toEqual(['Month', 'Hours', 'Cost', 'CPU', 'RAM', 'GPU', 'Network'])
    })

    it('places the average and maximum of a metric along its line, in the colour of the metric', () => {
        const [cpu, ram] = render().querySelectorAll('[role=img]')
        const [average, maximum] = cpu.children

        expect(average.style.width).toBe('20%')
        expect(maximum.style.left).toBe('90%')
        expect(cpu.style.getPropertyValue('--color')).toBe(USAGE_COLORS.cpu)
        expect(ram.style.getPropertyValue('--color')).toBe(USAGE_COLORS.ram)
    })

    it('explains the line with an example of 40% average and 90% maximum', () => {
        const [text, example] = render().querySelector('[data-widget-tooltip]').firstChild.children
        const [average, maximum] = example.querySelector('[role=img]').children

        expect(text.textContent).toBe('CPU, RAM and GPU show the average using a solid bar, and the maximum with a tick.')
        expect(example.textContent).toBe('Example, 40% average, 90% max:')
        expect(average.style.width).toBe('40%')
        expect(maximum.style.left).toBe('90%')
    })

    it('leaves the bare line for a metric that was not measured', () => {
        const gpu = render().querySelector('[aria-label="Not available"]')

        expect(gpu.style.getPropertyValue('--color')).toBe(USAGE_COLORS.gpu)
        expect(gpu.childElementCount).toBe(0)
    })

    it('shows the GPU usage of a month that has one', () => {
        const [month] = usage.months
        vi.mocked(api.sessions.usage$).mockReturnValue(of({
            months: [{...month, overall: {...month.overall, gpu: metric(30, 70)}}]
        }))

        expect(rows(render())[0][5]).toBe('avg 30%, max 70%')
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
    .map(row => [...row.querySelectorAll('td')].map(cell =>
        cell.querySelector('[role=img]')?.getAttribute('aria-label') ?? cell.textContent
    ))
const tooltips = () => [...document.querySelectorAll('[data-tooltip]')]
const content = container => container.querySelector('.content').textContent
