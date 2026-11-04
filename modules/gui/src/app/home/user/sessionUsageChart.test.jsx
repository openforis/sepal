// The chart under a session in the session list. Dygraph draws on a canvas jsdom cannot serve, and
// the resize detector needs layout, so both are passthroughs: what is under test is what the chart
// fetches and what it hands the graph.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/subscription', () => ({withSubscriptions: () => component => component}))
vi.mock('~/apiRegistry', () => ({default: {sessions: {sessionUsage$: vi.fn()}}}))
vi.mock('~/widget/elementResizeDetector', async () => {
    const {useEffect} = await import('react')
    return {
        ElementResizeDetector: ({children, onResize}) => {
            useEffect(() => onResize({width: 300}), [onResize])
            return children
        }
    }
})
vi.mock('~/widget/graph', () => ({
    Graph: props => {
        graphs.push(props)
        return <div className='graph'/>
    }
}))

import api from '~/apiRegistry'
import {setLanguage, TranslationProvider} from '~/translate'

import {SessionUsageChart} from './sessionUsageChart'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

let graphs

describe('the session usage chart', () => {
    let mounted

    const render = session => {
        const subscriptions = []
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <TranslationProvider>
                <SessionUsageChart session={session} addSubscription={subscription => subscriptions.push(subscription)}/>
            </TranslationProvider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            subscriptions.forEach(subscription => subscription.unsubscribe())
            container.remove()
        })
        return container
    }

    const lastGraph = () => graphs[graphs.length - 1]

    beforeEach(() => {
        mounted = []
        graphs = []
        vi.useFakeTimers()
        vi.mocked(api.sessions.sessionUsage$).mockReset()
    })
    afterEach(() => {
        mounted.forEach(unmount => unmount())
        vi.useRealTimers()
    })

    it('fetches the usage of the session it is under', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))
        const session = aSession()

        render(session)

        expect(api.sessions.sessionUsage$).toHaveBeenCalledWith(session)
    })

    it('plots CPU and RAM over time, keyed by the strip\'s labels', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))

        const container = render(aSession())

        expect(lastGraph().data).toEqual([
            [new Date(SAMPLES[0].time), 10, 20],
            [new Date(SAMPLES[1].time), 30, 40]
        ])
        expect(keys(container)).toEqual(['CPU', 'RAM'])
    })

    it('plots GPU too on a GPU instance', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))

        const container = render(aSession({instanceType: {gpuCount: 1}}))

        expect(lastGraph().data[0]).toEqual([new Date(SAMPLES[0].time), 10, 20, 50])
        expect(keys(container)).toEqual(['CPU', 'RAM', 'GPU'])
    })

    it('draws each series in the colour of its key', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))

        const container = render(aSession({instanceType: {gpuCount: 1}}))

        const keyColors = [...container.querySelectorAll('button')].map(({style}) => style.getPropertyValue('--color'))
        const seriesColors = ['cpu', 'ram', 'gpu'].map(key => lastGraph().series[key].color)
        expect(seriesColors).toEqual(keyColors)
        expect(new Set(seriesColors).size).toBe(3)
    })

    it('shows every line to begin with', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))

        render(aSession({instanceType: {gpuCount: 1}}))

        expect(lastGraph().visibility).toEqual([true, true, true])
    })

    it('hides a line when its key is clicked, and shows it again on a second click', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))
        const container = render(aSession())

        act(() => key(container, 'RAM').click())
        expect(lastGraph().visibility).toEqual([true, false])
        expect(key(container, 'RAM').getAttribute('aria-pressed')).toBe('false')

        act(() => key(container, 'RAM').click())
        expect(lastGraph().visibility).toEqual([true, true])
        expect(key(container, 'RAM').getAttribute('aria-pressed')).toBe('true')
    })

    it('keeps a hidden line hidden as new samples arrive', () => {
        vi.mocked(api.sessions.sessionUsage$)
            .mockReturnValueOnce(of({samples: SAMPLES}))
            .mockReturnValueOnce(of({samples: [...SAMPLES, NEXT_SAMPLE]}))
        const container = render(aSession())
        act(() => key(container, 'CPU').click())

        act(() => vi.advanceTimersByTime(60000))

        expect(lastGraph().data).toHaveLength(3)
        expect(lastGraph().visibility).toEqual([false, true])
    })

    it('marks the time along the bottom, without a value scale', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))

        render(aSession())

        expect(lastGraph().axes.x).toMatchObject({drawAxis: true, drawGrid: true})
        expect(lastGraph().axes.y).toMatchObject({drawAxis: false, drawGrid: false})
    })

    it('spans from the session\'s start to its latest sample, on a fixed percentage scale', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: SAMPLES}))
        const session = aSession()

        render(session)

        expect(lastGraph().dateWindow).toEqual([new Date(session.creationTime).getTime(), new Date(SAMPLES[1].time).getTime()])
        expect(lastGraph().valueRange).toEqual([0, 100])
    })

    it('draws nothing until there are two samples to join', () => {
        vi.mocked(api.sessions.sessionUsage$).mockReturnValue(of({samples: [SAMPLES[0]]}))

        render(aSession())

        expect(graphs).toEqual([])
    })

    it('picks up new samples every minute', () => {
        vi.mocked(api.sessions.sessionUsage$)
            .mockReturnValueOnce(of({samples: SAMPLES}))
            .mockReturnValueOnce(of({samples: [...SAMPLES, NEXT_SAMPLE]}))
        render(aSession())

        act(() => vi.advanceTimersByTime(60000))

        expect(lastGraph().data).toHaveLength(3)
    })

    it('keeps the chart it has when a refresh fails', () => {
        vi.mocked(api.sessions.sessionUsage$)
            .mockReturnValueOnce(of({samples: SAMPLES}))
            .mockReturnValueOnce(throwError(() => new Error('down')))
            .mockReturnValueOnce(of({samples: [...SAMPLES, NEXT_SAMPLE]}))
        render(aSession())

        act(() => vi.advanceTimersByTime(60000))
        expect(lastGraph().data).toHaveLength(2)

        act(() => vi.advanceTimersByTime(60000))
        expect(lastGraph().data).toHaveLength(3)
    })
})

const keys = container => [...container.querySelectorAll('button')].map(({textContent}) => textContent)

const key = (container, label) => [...container.querySelectorAll('button')].find(({textContent}) => textContent === label)

const aSession = overrides => ({
    id: 's1',
    path: 'sessions/session/s1',
    creationTime: '2026-08-17T07:00:00.000Z',
    instanceType: {gpuCount: 0},
    ...overrides
})

const SAMPLES = [
    {time: '2026-08-17T07:01:00.000Z', cpuPct: 10, ramPct: 20, gpuPct: 50, netBytesPerS: 100},
    {time: '2026-08-17T07:02:00.000Z', cpuPct: 30, ramPct: 40, gpuPct: 60, netBytesPerS: 200}
]

const NEXT_SAMPLE = {time: '2026-08-17T07:03:00.000Z', cpuPct: 50, ramPct: 60, gpuPct: 70, netBytesPerS: 300}
