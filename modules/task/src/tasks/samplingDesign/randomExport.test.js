import {jest} from '@jest/globals'
import {lastValueFrom, of, throwError, toArray} from 'rxjs'

// All EE effects are injected at task seams so the routing, ordering and cleanup are testable without EE.
const toGeometry$ = () => of('region')
const stratificationImage$ = jest.fn(() => of('eeStratificationImage'))
const unstratifiedRandomSamples$ = jest.fn(() => of({set: () => 'unstratifiedCollection'}))
const getSampleCounts$ = jest.fn(() => of({'1': 10}))
const tableToAsset$ = jest.fn(() => of({state: 'RUNNING'}))
const tableToSepal$ = jest.fn(() => of('sepalProgress'))
const tempTableAssetId$ = jest.fn(() => of('users/x/out_tmp_1'))

// Sparse rank-based stratified Random seams (EE graph + ready-asset inspection). The candidate collection and
// selection collection are opaque markers here; the repair loop is driven by the injected candidate counts.
const sparseRandomCandidates = jest.fn(({loThresholds}) => ({__candidates: loThresholds ? 'interval' : 'base'}))
const inspectCandidates$ = jest.fn(() => of({countsByStratum: {'1': 10}, size: 10}))
const selectStratifiedRandomSamples = jest.fn(() => ({set: () => 'selectedCollection'}))

// Minimal ee stand-in: FeatureCollection tags an id so we can prove getSampleCounts$ reads the READY temp asset,
// and the asset helpers are spies whose call order/args encode the promotion contract.
const featureCollection = jest.fn(id => {
    const fc = {__featureCollection: id}
    // Non-enumerable so toEqual({__featureCollection: id}) still matches; base+repair candidate assets merge.
    Object.defineProperty(fc, 'merge', {value: () => fc})
    return fc
})
const createParentFolder$ = jest.fn(() => of())
const deleteAssetRecursive$ = jest.fn(() => of())
const renameAsset$ = jest.fn(() => of('renamed'))
const deleteAsset$ = jest.fn(() => of('deleted'))
const ee = {FeatureCollection: featureCollection, createParentFolder$, deleteAssetRecursive$, renameAsset$, deleteAsset$}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/stratificationImage', () => ({stratificationImage$}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/samples', () => ({unstratifiedRandomSamples$}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/unstratifiedArea', () => ({unstratifiedAllocation$: ({allocation}) => of(allocation)}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/validateSampleCounts', () => ({getSampleCounts$}))
jest.unstable_mockModule('#task/jobs/export/tableToAsset', () => ({tableToAsset$}))
jest.unstable_mockModule('#task/jobs/export/tableToSepal', () => ({tableToSepal$}))
jest.unstable_mockModule('./tempTableAsset.js', () => ({tempTableAssetId$}))
jest.unstable_mockModule('#sepal/ee/samplingDesign/sparseRandomSampling', () => ({sparseRandomCandidates, inspectCandidates$, selectStratifiedRandomSamples}))

const {exportRandomToAssets$} = await import('./randomExport.js')

// area is large by default so the initial per-stratum threshold is well below 1 (the estimate is
// max(2*n, 10) / (area / scale^2)); a large frame lets the repair path run instead of saturating at 1.
const recipe = ({skip, crs = 'EPSG:6933', area = 1e6} = {}) => ({
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        stratification: {skip, scale: 10, strata: [{stratum: 1, weight: 1, area}]},
        sampleAllocation: {minSamplesPerStratum: 2, allocation: [{stratum: 1, label: 'a', area, sampleSize: 10, weight: 1}]},
        sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1, crs}
    }
})

const run = ({skip, strategy = 'create', destination = 'GEE', area} = {}) => lastValueFrom(
    exportRandomToAssets$({taskId: 't1', description: 'd', recipe: recipe({skip, area}), assetId: 'users/x/out', strategy, destination})
        .pipe(toArray())
).catch(e => e)

const PROGRESS_PREFIX = 'tasks.samplingDesign.random.progress.'
const stageKeys = emissions => emissions
    .filter(value => value?.messageKey?.startsWith(PROGRESS_PREFIX))
    .map(value => value.messageKey.slice(PROGRESS_PREFIX.length))

beforeEach(() => jest.clearAllMocks())

describe('unstratified Random export', () => {
    it('creates no temp asset, runs no count graph, and skips the check stage', async () => {
        const emissions = await run({skip: [true]})
        expect(tempTableAssetId$).not.toHaveBeenCalled()
        expect(getSampleCounts$).not.toHaveBeenCalled()
        expect(stageKeys(emissions)).toEqual(['prepareCandidates', 'exportFinal'])
    })

    it('exports the exact-count sample directly to the asset', async () => {
        await run({skip: [true]})
        expect(unstratifiedRandomSamples$).toHaveBeenCalledTimes(1)
        expect(tableToAsset$).toHaveBeenCalledTimes(1)
        expect(tableToAsset$.mock.calls[0][0]).toMatchObject({assetId: 'users/x/out', strategy: 'create'})
        expect(renameAsset$).not.toHaveBeenCalled()
    })
})

describe('stratified Random export (sparse rank-based)', () => {
    // Default: the base candidate materialization already has enough (>= requested 10), so the happy path takes
    // no repair round. Individual tests override this to force repair or a genuine shortfall.
    beforeEach(() => inspectCandidates$.mockReturnValue(of({countsByStratum: {'1': 10}, size: 10})))

    it('validates the READY selected asset and never counts a lazy sample', async () => {
        await run({skip: false})
        expect(tempTableAssetId$).toHaveBeenCalledTimes(1)
        const assetIds = tableToAsset$.mock.calls.map(call => call[0].assetId)
        // candidate materialization then the selected export, both creates
        expect(assetIds).toEqual(['users/x/out_tmp_1_candidates', 'users/x/out_tmp_1_selected'])
        expect(tableToAsset$.mock.calls.every(call => call[0].strategy === 'create')).toBe(true)
        // final validation counts the READY selected asset, never a lazy selection graph
        expect(getSampleCounts$).toHaveBeenCalledTimes(1)
        expect(getSampleCounts$.mock.calls[0][0].__featureCollection).toBe('users/x/out_tmp_1_selected')
    })

    it('emits Finding -> Checking -> Exporting', async () => {
        const emissions = await run({skip: false})
        expect(stageKeys(emissions)).toEqual(['prepareCandidates', 'checkCandidates', 'exportFinal'])
    })

    describe('valid design, GEE destination', () => {
        it('publishes the selected table by rename instead of re-exporting', async () => {
            await run({skip: false, strategy: 'create'})
            expect(renameAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_selected', 'users/x/out')
            expect(createParentFolder$).toHaveBeenCalledWith('users/x/out', 1)
        })

        it('does not delete the destination for a create', async () => {
            await run({skip: false, strategy: 'create'})
            expect(deleteAssetRecursive$).not.toHaveBeenCalled()
        })

        it('for replace, deletes the destination only during promotion, after validation', async () => {
            await run({skip: false, strategy: 'replace'})
            expect(deleteAssetRecursive$).toHaveBeenCalledWith('users/x/out', expect.objectContaining({include: expect.arrayContaining(['Table'])}))
            expect(deleteAssetRecursive$.mock.invocationCallOrder[0]).toBeGreaterThan(getSampleCounts$.mock.invocationCallOrder[0])
        })

        it('the promoted selection is consumed by the rename, so cleanup does not delete it', async () => {
            await run({skip: false, strategy: 'create'})
            expect(deleteAsset$).not.toHaveBeenCalledWith('users/x/out_tmp_1_selected')
            expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_candidates')
        })
    })

    describe('valid design, SEPAL destination', () => {
        it('exports from the validated selected asset, then cleans up all temporaries', async () => {
            await run({skip: false, destination: 'SEPAL'})
            expect(tableToSepal$).toHaveBeenCalledTimes(1)
            expect(tableToSepal$.mock.calls[0][1].collection.__featureCollection).toBe('users/x/out_tmp_1_selected')
            expect(renameAsset$).not.toHaveBeenCalled()
            expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_candidates')
            expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_selected')
        })
    })

    describe('final underproduction at threshold 1', () => {
        // area=1 saturates the initial threshold at 1, so a short candidate count is a genuine shortfall (not a
        // repairable one): repair is only offered while a deficient stratum is still below threshold 1.
        beforeEach(() => inspectCandidates$.mockReturnValue(of({countsByStratum: {'1': 3}, size: 3})))

        it('does not mutate the destination and surfaces the structured error', async () => {
            const error = await run({skip: false, strategy: 'replace', area: 1})
            expect(renameAsset$).not.toHaveBeenCalled()
            expect(deleteAssetRecursive$).not.toHaveBeenCalled()
            expect(tableToSepal$).not.toHaveBeenCalled()
            expect(error?.userMessage?.key).toMatch(/underproduction/)
        })

        it('cleans up the candidate temp asset', async () => {
            await run({skip: false, area: 1})
            expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_candidates')
        })

        it('a cleanup failure does not replace the underproduction error', async () => {
            deleteAsset$.mockReturnValueOnce(throwError(() => new Error('cleanup boom')))
            const error = await run({skip: false, area: 1})
            expect(error?.userMessage?.key).toMatch(/underproduction/)
            expect(error.message).not.toContain('cleanup boom')
        })
    })

    describe('cleanup on other terminal states', () => {
        it('runs after a promotion failure, deleting the unpromoted temporaries', async () => {
            renameAsset$.mockReturnValueOnce(throwError(() => new Error('rename failed')))
            const error = await run({skip: false})
            expect(error.message).toBe('rename failed')
            // The selection was never promoted (rename failed), so cleanup deletes both temporaries.
            expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_candidates')
            expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_selected')
        })
    })

    // Outer lifecycle witness for the sparse rank-based redesign: a short base candidate export triggers one
    // additional disjoint interval, the selected ready asset validates, and only then is the destination
    // published; temporary candidate/repair assets are cleaned. Selection is mocked here, so this asserts the
    // repair/validate/publish/cleanup wiring, not statistical selection correctness (an EE-only concern).
    it('repairs a short base candidate export, then validates and publishes the selection', async () => {
        // Base candidate materialization is short for stratum 1; the additional interval brings it over the line.
        inspectCandidates$
            .mockReturnValueOnce(of({countsByStratum: {'1': 4}, size: 4}))
            .mockReturnValueOnce(of({countsByStratum: {'1': 8}, size: 8}))
        // The ready SELECTED asset validates to the requested count (10).
        getSampleCounts$.mockReturnValue(of({'1': 10}))

        const emissions = await run({skip: false, strategy: 'create'})

        // The repair round announces Finding before its export and Checking before its inspection, mirroring the
        // base round - never "Checking" while the long repair export is still running.
        expect(stageKeys(emissions)).toEqual(['prepareCandidates', 'checkCandidates', 'prepareCandidates', 'checkCandidates', 'exportFinal'])
        // base candidate export, one additional (repair) interval export, and the final selected export
        const assetIds = tableToAsset$.mock.calls.map(call => call[0].assetId)
        expect(tableToAsset$).toHaveBeenCalledTimes(3)
        expect(assetIds[0]).toBe('users/x/out_tmp_1_candidates')
        expect(assetIds[1]).toBe('users/x/out_tmp_1_additional_candidates_1')
        expect(assetIds[2]).toBe('users/x/out_tmp_1_selected')
        // publication happens only after the READY selected asset validates to the requested counts
        expect(getSampleCounts$.mock.calls[0][0]).toEqual({__featureCollection: 'users/x/out_tmp_1_selected'})
        expect(renameAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_selected', 'users/x/out')
        // temporary candidate + repair assets are cleaned (the selected temp is consumed by the rename)
        expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_candidates')
        expect(deleteAsset$).toHaveBeenCalledWith('users/x/out_tmp_1_additional_candidates_1')
    })
})
