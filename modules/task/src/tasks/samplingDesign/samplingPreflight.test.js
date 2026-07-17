import {lastValueFrom} from 'rxjs'

import {exportRandomToAssets$} from './randomExport.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'
import {exportSystematicToAssets$} from './systematicExport.js'

const recipe = ({allocation, minSamplesPerStratum = 2, allocationStrategy = 'PROPORTIONAL', manual, skip = false}) => ({
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        stratification: {skip, scale: 10, crs: 'EPSG:6933', crsTransform: '', strata: [{stratum: 1, weight: 1, area: 1}]},
        sampleAllocation: {allocation, minSamplesPerStratum, allocationStrategy, manual},
        sampleArrangement: {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 60, gridOrigin: 'FIXED', seed: 1}
    }
})
const key = error => error?.userMessage?.key

describe('samplingDesignPreflightError', () => {
    it('accepts a design where every stratum requests at least the effective minimum', () => {
        expect(samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}, {stratum: 2, label: 'b', sampleSize: 2}]
        }))).toBeNull()
    })

    it('rejects a stratum requesting fewer than 2 samples, whatever the configured minimum', () => {
        const error = samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}, {stratum: 2, label: 'snow', sampleSize: 1}]
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum')
        expect(error.userMessage.args).toEqual({floor: 2, strata: 'snow (1)'})
    })

    it('rejects a configured minimum below the statistical floor', () => {
        expect(key(samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}], minSamplesPerStratum: 1
        })))).toBe('tasks.samplingDesign.preflight.invalidMinimum')
        expect(key(samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}], minSamplesPerStratum: 0
        })))).toBe('tasks.samplingDesign.preflight.invalidMinimum')
    })

    it('rejects an automatic allocation that does not satisfy its own configured minimum', () => {
        const error = samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}, {stratum: 2, label: 'snow', sampleSize: 4}],
            minSamplesPerStratum: 5
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowConfiguredMinimum')
        expect(error.userMessage.args).toEqual({minimum: 5, strata: 'snow (4)', value: 4, floor: 2})
    })

    it('ignores a configured minimum for EQUAL and manual allocation, which floor at 2', () => {
        const allocation = [{stratum: 1, label: 'a', sampleSize: 2}]
        expect(samplingDesignPreflightError(recipe({allocation, allocationStrategy: 'EQUAL', minSamplesPerStratum: 1}))).toBeNull()
        expect(samplingDesignPreflightError(recipe({allocation, manual: [true], minSamplesPerStratum: 1}))).toBeNull()
    })

    it('requires at least 2 total samples for an unstratified design', () => {
        expect(key(samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'all', sampleSize: 1}], skip: [true]
        })))).toBe('tasks.samplingDesign.preflight.unstratifiedBelowMinimum')
    })
})

// An invalid recipe must never reach temp-asset resolution or EE graph construction: if the preflight were not
// wired, subscribing would attempt EE and never emit this structured error.
describe('preflight gates the export routes before any EE work', () => {
    const invalid = recipe({allocation: [{stratum: 1, label: 'snow', sampleSize: 1}]})

    it('systematic export emits the structured preflight error without resolving assets', async () => {
        const error = await lastValueFrom(exportSystematicToAssets$({
            taskId: 't1', description: 'd', recipe: invalid, assetId: 'users/x/out', strategy: 'create', destination: 'GEE'
        })).catch(e => e)
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum')
    })

    it('random export emits the structured preflight error without building an EE graph', async () => {
        const error = await lastValueFrom(exportRandomToAssets$({
            taskId: 't1', description: 'd', recipe: invalid, assetId: 'users/x/out', strategy: 'create', destination: 'GEE'
        })).catch(e => e)
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum')
    })
})
