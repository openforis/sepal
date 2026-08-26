import {lastValueFrom} from 'rxjs'

import {exportSystematicToAssets$} from './systematicExport.js'

// Minimal recipe. `crs` sets both grids by default so one argument drives whichever mode the test selects;
// `stratificationCrs` overrides the interpretation grid so the two can be separated.
const recipe = (crs, {minDistance = 60, scale = 10, skip = false, stratificationCrs = crs} = {}) => ({
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        stratification: {skip, scale, crs: stratificationCrs, strata: [{stratum: 1, weight: 1, area: 1}]},
        sampleAllocation: {allocation: [{stratum: 1, label: 'a', area: 1, sampleSize: 10, weight: 1}]},
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance, gridOrigin: 'FIXED', seed: 1, crs}
    }
})

const runExport = recipeModel => lastValueFrom(exportSystematicToAssets$({
    taskId: 't1', description: 'd', recipe: recipeModel,
    assetId: 'users/x/out', strategy: 'create', destination: 'GEE'
})).catch(e => e)

describe('exportSystematicToAssets$ sampling-grid CRS gate', () => {
    it('emits the structured unsupported-CRS error for an uncurated grid CRS, before any EE graph / asset resolution', async () => {
        // If the gate were not wired, the returned observable would be the export pipeline (temp-asset resolution,
        // stratificationImage$, toGeometry$ ...) and subscribing would attempt EE - never emitting this structured
        // grid error. Receiving it proves the CRS contract is enforced at the task boundary before any EE work.
        const result$ = exportSystematicToAssets$({
            taskId: 't1', description: 'd', recipe: recipe('EPSG:4326'),
            assetId: 'users/x/out', strategy: 'create', destination: 'GEE'
        })
        const error = await lastValueFrom(result$).catch(e => e)
        expect(error?.userMessage?.key).toBe('tasks.samplingDesign.grid.unsupportedArrangementCrs')
        expect(error?.userMessage?.args?.supported).toContain('EPSG:6933 - EASE-Grid 2.0 Global')
    })
})

// A direct API/task recipe must not bypass the raster spacing floor: the stratified lattice sits on the
// stratification grid, so two samples can never be closer than two grid pixels.
describe('exportSystematicToAssets$ stratified minimum-distance gate', () => {
    it('emits the structured error before any temp-asset resolution or candidate graph construction', async () => {
        // If the gate were not wired, subscribing would enter the export pipeline (tempTableAssetId$,
        // stratificationImage$, toGeometry$ ...) and attempt EE rather than emitting this structured error.
        const error = await runExport(recipe('EPSG:6933', {minDistance: 5, scale: 10}))
        expect(error?.userMessage?.key).toBe('tasks.samplingDesign.systematic.grid.minDistanceBelowGrid')
        expect(error?.userMessage?.args).toEqual({value: 5, pixelSize: 10, minimum: 20})
    })

    it('does not apply the raster floor to unstratified systematic, which is analytical', async () => {
        const error = await runExport(recipe('EPSG:6933', {minDistance: 5, scale: 10, skip: [true]}))
        expect(error?.userMessage?.key).not.toBe('tasks.samplingDesign.systematic.grid.minDistanceBelowGrid')
    })
})

// The Arrangement CRS stays restricted to the curated equal-area catalog; the Stratification CRS does not,
// because it names the projection the categorical source is interpreted in.
describe('exportSystematicToAssets$ two-grid validation', () => {
    it('accepts a non-curated Stratification CRS alongside a curated Arrangement CRS', async () => {
        const error = await runExport(recipe('EPSG:6933', {stratificationCrs: 'EPSG:32636'}))
        expect(error?.userMessage?.key).not.toBe('tasks.samplingDesign.grid.unsupportedArrangementCrs')
        expect(error?.userMessage?.key).not.toBe('tasks.samplingDesign.grid.invalidStratificationCrs')
    })

    it('rejects a blank Stratification CRS', async () => {
        const error = await runExport(recipe('EPSG:6933', {stratificationCrs: ''}))
        expect(error?.userMessage?.key).toBe('tasks.samplingDesign.grid.invalidStratificationCrs')
    })

    it('keeps the raster floor on the Stratification pixel size, not the Arrangement grid', async () => {
        const error = await runExport(recipe('EPSG:6933', {minDistance: 5, scale: 30, stratificationCrs: 'EPSG:32636'}))
        expect(error?.userMessage?.args).toEqual({value: 5, pixelSize: 30, minimum: 60})
    })
})
