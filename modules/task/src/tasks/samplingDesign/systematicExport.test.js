import {lastValueFrom} from 'rxjs'

import {exportSystematicToAssets$} from './systematicExport.js'

// Minimal stratified recipe. Scale comes from Stratification; the sampling-grid CRS from Sample Arrangement.
const recipe = (crs, {minDistance = 60, scale = 10, skip = false} = {}) => ({
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        stratification: {skip, scale, strata: [{stratum: 1, weight: 1, area: 1}]},
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
        expect(error?.userMessage?.key).toBe('tasks.samplingDesign.systematic.grid.unsupportedCrs')
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
