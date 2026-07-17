import {lastValueFrom} from 'rxjs'

import {exportSystematicToAssets$} from './systematicExport.js'

// Minimal stratified recipe whose sampling-grid CRS comes from the Stratification panel.
const recipe = crs => ({
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        stratification: {skip: false, scale: 10, crs, crsTransform: '', strata: [{stratum: 1, weight: 1, area: 1}]},
        sampleAllocation: {allocation: [{stratum: 1, label: 'a', area: 1, sampleSize: 10, weight: 1}]},
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 60, gridOrigin: 'FIXED', seed: 1}
    }
})

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
