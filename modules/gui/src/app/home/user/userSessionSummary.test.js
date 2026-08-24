import {describe, expect, it} from 'vitest'

import {runningItems, usageMetrics, verdictOf} from './userSessionSummary'

const session = ({gpuCount = 0, ...overrides} = {}) => ({
    instanceType: {name: 't3a.small', gpuCount, hourlyCost: 0.02},
    apps: [],
    terminals: 0,
    verdict: 'unknown',
    usage: {cpuPct: 12.4, ramPct: 34.6, gpuPct: null, netBytesPerS: 1234},
    ...overrides
})

describe('usageMetrics', () => {
    it('reports cpu, network and ram, in that order', () => {
        expect(usageMetrics(session())).toEqual([
            {key: 'cpu', pct: 12.4},
            {key: 'net', bytesPerS: 1234},
            {key: 'ram', pct: 34.6}
        ])
    })

    // A GPU reading on a CPU instance is meaningless, and a permanent "GPU 0%" on every session
    // trains the eye to skip the line the verdict lives on.
    it('reports gpu between cpu and network, but only on GPU instances', () => {
        const gpu = session({gpuCount: 1, usage: {cpuPct: 12.4, ramPct: 34.6, gpuPct: 80, netBytesPerS: 1234}})
        expect(usageMetrics(gpu).map(({key}) => key)).toEqual(['cpu', 'gpu', 'net', 'ram'])
        expect(usageMetrics(gpu)[1]).toEqual({key: 'gpu', pct: 80})
    })

    // The sampler reports no GPU percentage until nvidia-smi has answered once.
    it('reports a GPU instance with no reading yet as zero', () => {
        const gpu = session({gpuCount: 1, usage: {cpuPct: 1, ramPct: 2, gpuPct: null, netBytesPerS: 0}})
        expect(usageMetrics(gpu)[1]).toEqual({key: 'gpu', pct: 0})
    })

    // Not measured is not the same as measured as zero, and a session with no sample at all has
    // nothing honest to show.
    it('omits network that was not measured', () => {
        const noNet = session({usage: {cpuPct: 12.4, ramPct: 34.6, gpuPct: null, netBytesPerS: null}})
        expect(usageMetrics(noNet).map(({key}) => key)).toEqual(['cpu', 'ram'])
    })

    it('has nothing to report without a usage sample', () => {
        expect(usageMetrics(session({usage: null}))).toBeNull()
        expect(usageMetrics(session({usage: {cpuPct: null, ramPct: null}}))).toBeNull()
    })
})

describe('verdictOf', () => {
    it('names a verdict the sampler reached', () => {
        expect(verdictOf(session({verdict: 'unused'}))).toBe('unused')
        expect(verdictOf(session({verdict: 'busy'}))).toBe('busy')
    })

    // 'unused' is what tells a user their instance is about to be stopped — a session the sampler
    // has not reached yet must say nothing rather than guess.
    it('says nothing when the sampler has not reached the session', () => {
        expect(verdictOf(session({verdict: 'unknown'}))).toBeNull()
        expect(verdictOf(session({verdict: undefined}))).toBeNull()
    })
})

describe('runningItems', () => {
    it('lists the apps by label, falling back to the path', () => {
        const apps = [{path: '/sandbox/jupyter', label: 'Jupyter'}, {path: '/sandbox/shiny/foo', label: null}]
        expect(runningItems(session({apps}))).toEqual([
            {type: 'app', key: '/sandbox/jupyter', label: 'Jupyter'},
            {type: 'app', key: '/sandbox/shiny/foo', label: '/sandbox/shiny/foo'}
        ])
    })

    it('puts the terminal sessions last', () => {
        const apps = [{path: '/sandbox/jupyter', label: 'Jupyter'}]
        expect(runningItems(session({apps, terminals: 2})).at(-1)).toEqual({
            type: 'terminals', key: 'terminals', count: 2
        })
    })

    it('leaves terminals out when none are running', () => {
        expect(runningItems(session({terminals: 0}))).toEqual([])
        expect(runningItems(session({terminals: undefined}))).toEqual([])
    })
})
