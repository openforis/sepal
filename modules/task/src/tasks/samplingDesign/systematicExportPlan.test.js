import {lastValueFrom, of} from 'rxjs'

import {systematicExportPlan$} from './systematicExportPlan.js'

const spy = (impl = () => of(undefined)) => {
    const calls = []
    const fn = (...args) => {
        calls.push(args)
        return impl(...args)
    }
    fn.calls = calls
    return fn
}

const allocation = [
    {stratum: 1, sampleSize: 100},
    {stratum: 2, sampleSize: 50}
]

const summary = raw => ({raw, actual: raw, levels: {}})

// candidatesOf returns a marker describing what would be assembled, so the test can assert the final export
// used base-only vs repaired candidates without any EE.
const candidatesOf = ({baseAssetId, repairAssetId, repairedStrata}) => ({
    baseAssetId,
    repairAssetId,
    repaired: repairedStrata?.map(({stratum}) => stratum)
})

const run = ({countByAsset, requireFull = true, maxOffsetOf = () => 5}) => {
    const exportUnfiltered$ = spy()
    const count$ = spy(({assetId}) => of(countByAsset(assetId)))
    const finalExport$ = spy(() => of('exported'))
    const result$ = systematicExportPlan$({
        allocation,
        baseOffset: 0,
        maxOffsetOf,
        requireFull,
        baseAssetId: 't_base',
        repairAssetId: 't_repair',
        exportUnfiltered$,
        count$,
        candidatesOf,
        finalExport$
    })
    return {exportUnfiltered$, finalExport$, result$}
}

describe('systematicExportPlan$', () => {
    it('base-only: exports the base candidates then the final export when nothing underproduces', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: () => summary({1: 100, 2: 50})
        })
        const out = await lastValueFrom(result$)
        expect(out).toBe('exported')
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls).toHaveLength(1)
        expect(finalExport$.calls[0][0].candidates).toEqual({baseAssetId: 't_base', repairAssetId: undefined, repaired: undefined})
    })

    it('repair: exports base, then a repair for underproducing strata, then the final export', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: assetId => assetId === 't_base'
                ? summary({1: 40, 2: 50}) // stratum 1 short
                : summary({1: 100}) // repair asset sufficient
        })
        const out = await lastValueFrom(result$)
        expect(out).toBe('exported')
        // base first (full allocation), then repair (only stratum 1)
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base', 't_repair'])
        expect(exportUnfiltered$.calls[1][0].allocation.map(({stratum}) => stratum)).toEqual([1])
        expect(exportUnfiltered$.calls[1][0].densityOffset).toBeGreaterThan(0)
        expect(finalExport$.calls[0][0].candidates).toEqual({baseAssetId: 't_base', repairAssetId: 't_repair', repaired: [1]})
    })

    it('EXACT/OVER fail clearly when the densest allowed grid still underproduces (no repair possible)', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: () => summary({1: 40, 2: 50}),
            maxOffsetOf: () => 0 // no stratum can densify past base
        })
        // Single subscription: the observable is cold and side-effecting, so capture the error once.
        const error = await lastValueFrom(result$).then(() => null, e => e)
        expect(error).toBeInstanceOf(Error)
        // Structured user message (min-distance-limit), naming the failing stratum with available/requested.
        expect(error.userMessage.key).toBe('tasks.samplingDesign.systematic.underproduced.minDistanceLimit')
        expect(error.userMessage.args.strata).toContain('stratum 1: 40 available / 100 requested')
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls).toHaveLength(0)
    })

    it('EXACT/OVER fail immediately (no repair export) when any failing stratum is at its min-distance limit', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: () => summary({1: 40, 2: 40}), // both strata short
            maxOffsetOf: ({stratum}) => stratum === 1 ? 0 : 5 // stratum 1 can't densify, stratum 2 could
        })
        const error = await lastValueFrom(result$).then(() => null, e => e)
        expect(error).toBeInstanceOf(Error)
        expect(error.userMessage.key).toBe('tasks.samplingDesign.systematic.underproduced.minDistanceLimit')
        // Only the non-repairable stratum is named.
        expect(error.userMessage.args.strata).toBe('stratum 1: 40 available / 100 requested')
        // No repair export was attempted - only the base export ran.
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls).toHaveLength(0)
    })

    it('EXACT/OVER fail clearly when a stratum is still short after the repair export', async () => {
        const {finalExport$, result$} = run({
            countByAsset: () => summary({1: 40, 2: 50}) // still short on the repair asset too
        })
        const error = await lastValueFrom(result$).then(() => null, e => e)
        expect(error.userMessage.key).toBe('tasks.samplingDesign.systematic.underproduced.repairExhausted')
        expect(error.userMessage.args.strata).toContain('stratum 1: 40 available / 100 requested')
        expect(finalExport$.calls).toHaveLength(0)
    })

    it('CLOSEST proceeds with base candidates when densifying is not possible', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: () => summary({1: 40, 2: 50}),
            requireFull: false,
            maxOffsetOf: () => 0
        })
        const out = await lastValueFrom(result$)
        expect(out).toBe('exported')
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls[0][0].candidates).toEqual({baseAssetId: 't_base', repairAssetId: undefined, repaired: undefined})
    })
})
