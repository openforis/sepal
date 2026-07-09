import {EMPTY, of} from 'rxjs'

import {systematicExportPlan$} from './systematicExportPlan.js'

const spy = (impl = () => EMPTY) => {
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

const summary = raw => ({raw, actual: raw, levels: Object.fromEntries(Object.keys(raw).map(stratum => [stratum, Number(stratum)]))})

// candidatesOf returns a marker describing what would be assembled, so the test can assert the final export
// used base-only vs repaired candidates without any EE.
const candidatesOf = ({baseAssetId, repairAssetId, repairedStrata}) => ({
    baseAssetId,
    repairAssetId,
    repaired: repairedStrata?.map(({stratum}) => stratum)
})

// Single subscription: the plan is cold and side-effecting. Collect every emission plus terminal state.
const collect = result$ => new Promise(resolve => {
    const emissions = []
    result$.subscribe({
        next: value => emissions.push(value),
        error: error => resolve({emissions, error}),
        complete: () => resolve({emissions, error: null})
    })
})

const PROGRESS_PREFIX = 'tasks.samplingDesign.systematic.progress.'
const stageKeys = emissions => emissions
    .filter(value => value?.messageKey?.startsWith(PROGRESS_PREFIX))
    .map(value => value.messageKey.slice(PROGRESS_PREFIX.length))

const run = ({countByAsset, requireFull = true, maxOffsetOf = () => 5, exportUnfiltered$ = spy()}) => {
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
    it('base-only: prepare base -> check base -> export final, exporting base candidates', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: () => summary({1: 100, 2: 50})
        })
        const {emissions, error} = await collect(result$)
        expect(error).toBeNull()
        expect(stageKeys(emissions)).toEqual(['prepareBaseCandidates', 'checkBaseCandidates', 'exportFinal'])
        expect(emissions.at(-1)).toBe('exported')
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls[0][0].candidates).toEqual({baseAssetId: 't_base', repairAssetId: undefined, repaired: undefined})
        expect(finalExport$.calls[0][0]).toMatchObject({densityOffset: 0, candidateDensityOffset: 0})
        expect(finalExport$.calls[0][0].levelsByStratum).toEqual({'1': 1, '2': 2})
        // Base-only: no strata were repaired, so exact geometry uses the base offset for every stratum.
        expect(finalExport$.calls[0][0].repairedStrata).toEqual([])
    })

    it('repair: prepare base -> check base -> prepare repair -> check repair -> export final', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: assetId => assetId === 't_base'
                ? summary({1: 40, 2: 50}) // stratum 1 short
                : summary({1: 100}) // repair asset sufficient
        })
        const {emissions, error} = await collect(result$)
        expect(error).toBeNull()
        expect(stageKeys(emissions)).toEqual([
            'prepareBaseCandidates', 'checkBaseCandidates', 'prepareRepairCandidates', 'checkRepairCandidates', 'exportFinal'
        ])
        expect(emissions.at(-1)).toBe('exported')
        // base first (full allocation), then repair (only stratum 1)
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base', 't_repair'])
        expect(exportUnfiltered$.calls[1][0].allocation.map(({stratum}) => stratum)).toEqual([1])
        expect(exportUnfiltered$.calls[1][0].densityOffset).toBeGreaterThan(0)
        expect(finalExport$.calls[0][0].candidates).toEqual({baseAssetId: 't_base', repairAssetId: 't_repair', repaired: [1]})
        expect(finalExport$.calls[0][0].densityOffset).toBe(0)
        expect(finalExport$.calls[0][0].candidateDensityOffset).toBe(exportUnfiltered$.calls[1][0].densityOffset)
        expect(finalExport$.calls[0][0].levelsByStratum).toEqual({'1': 1, '2': 2})
        // Only the repaired stratum is flagged, so the finalizer materializes it at the repair offset and the
        // rest at the base offset.
        expect(finalExport$.calls[0][0].repairedStrata.map(({stratum}) => stratum)).toEqual([1])
    })

    it('uses repair-selected levels only for repaired strata', async () => {
        const finalExport$ = spy(() => of('exported'))
        const result$ = systematicExportPlan$({
            allocation,
            baseOffset: 0,
            maxOffsetOf: () => 5,
            requireFull: true,
            baseAssetId: 't_base',
            repairAssetId: 't_repair',
            exportUnfiltered$: spy(),
            count$: spy(({assetId}) => of(assetId === 't_base'
                ? {raw: {1: 40, 2: 50}, actual: {1: 40, 2: 50}, levels: {1: 0, 2: 2}}
                : {raw: {1: 100}, actual: {1: 100}, levels: {1: 3}}
            )),
            candidatesOf,
            finalExport$
        })
        const {error} = await collect(result$)
        expect(error).toBeNull()
        expect(finalExport$.calls[0][0].levelsByStratum).toEqual({1: 3, 2: 2})
    })

    it('passes the candidate density offset to both count stages', async () => {
        const countCalls = []
        const count$ = spy(args => {
            countCalls.push(args)
            return of(args.assetId === 't_base'
                ? summary({1: 40, 2: 50})
                : summary({1: 100})
            )
        })
        const result$ = systematicExportPlan$({
            allocation,
            baseOffset: 0,
            maxOffsetOf: () => 5,
            requireFull: true,
            baseAssetId: 't_base',
            repairAssetId: 't_repair',
            exportUnfiltered$: spy(),
            count$,
            candidatesOf,
            finalExport$: spy(() => of('exported'))
        })
        const {error} = await collect(result$)
        expect(error).toBeNull()
        expect(countCalls[0]).toMatchObject({assetId: 't_base', densityOffset: 0})
        expect(countCalls[1].assetId).toBe('t_repair')
        expect(countCalls[1].densityOffset).toBeGreaterThan(0)
    })

    it('passes through the temp export EE progress (does not swallow it)', async () => {
        const eeProgress = {state: 'RUNNING', messageKey: 'tasks.ee.export.running', defaultMessage: 'Google Earth Engine is exporting'}
        const {result$} = run({
            countByAsset: () => summary({1: 100, 2: 50}),
            exportUnfiltered$: spy(() => of(eeProgress))
        })
        const {emissions} = await collect(result$)
        expect(emissions).toContainEqual(eeProgress)
    })

    it('EXACT/OVER fail clearly when the densest allowed grid still underproduces (prepare/check base first)', async () => {
        const {exportUnfiltered$, finalExport$, result$} = run({
            countByAsset: () => summary({1: 40, 2: 50}),
            maxOffsetOf: () => 0 // no stratum can densify past base
        })
        const {emissions, error} = await collect(result$)
        expect(error).toBeInstanceOf(Error)
        // Progress up to the check, then the failure - no repair or final stage.
        expect(stageKeys(emissions)).toEqual(['prepareBaseCandidates', 'checkBaseCandidates'])
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
        const {emissions, error} = await collect(result$)
        expect(error).toBeInstanceOf(Error)
        expect(stageKeys(emissions)).toEqual(['prepareBaseCandidates', 'checkBaseCandidates'])
        expect(error.userMessage.key).toBe('tasks.samplingDesign.systematic.underproduced.minDistanceLimit')
        // Only the non-repairable stratum is named.
        expect(error.userMessage.args.strata).toBe('stratum 1: 40 available / 100 requested')
        // No repair export was attempted - only the base export ran.
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls).toHaveLength(0)
    })

    it('EXACT/OVER fail after the repair export when a stratum is still short (progress through check repair)', async () => {
        const {finalExport$, result$} = run({
            countByAsset: () => summary({1: 40, 2: 50}) // still short on the repair asset too
        })
        const {emissions, error} = await collect(result$)
        expect(stageKeys(emissions)).toEqual([
            'prepareBaseCandidates', 'checkBaseCandidates', 'prepareRepairCandidates', 'checkRepairCandidates'
        ])
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
        const {emissions, error} = await collect(result$)
        expect(error).toBeNull()
        expect(stageKeys(emissions)).toEqual(['prepareBaseCandidates', 'checkBaseCandidates', 'exportFinal'])
        expect(emissions.at(-1)).toBe('exported')
        expect(exportUnfiltered$.calls.map(([{assetId}]) => assetId)).toEqual(['t_base'])
        expect(finalExport$.calls[0][0].candidates).toEqual({baseAssetId: 't_base', repairAssetId: undefined, repaired: undefined})
        expect(finalExport$.calls[0][0]).toMatchObject({densityOffset: 0, candidateDensityOffset: 0})
    })
})
