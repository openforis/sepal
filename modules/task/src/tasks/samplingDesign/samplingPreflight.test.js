import {lastValueFrom} from 'rxjs'

import {exportRandomToAssets$} from './randomExport.js'
import {samplingDesignPreflightError} from './samplingPreflight.js'
import {exportSystematicToAssets$} from './systematicExport.js'

// By default the configured strata mirror the allocated strata, so membership passes and each test exercises the
// rule it targets; a test can pass `strata` explicitly to drive a membership mismatch.
const strataFor = allocation => [...new Set((allocation || []).map(({stratum}) => stratum))]
    .map(stratum => ({stratum, value: stratum, weight: 1, area: 1}))

const recipe = ({
    allocation,
    strata = strataFor(allocation),
    minSamplesPerStratum = 2,
    allocationStrategy = 'PROPORTIONAL',
    estimateSampleSize = false,
    manual,
    skip = false,
    sampleArrangement = {arrangementStrategy: 'SYSTEMATIC', sampleSizeStrategy: 'OVER', minDistance: 60, gridOrigin: 'FIXED', seed: 1}
}) => ({
    model: {
        aoi: {type: 'ASSET', id: 'users/x/aoi'},
        stratification: {skip, scale: 10, crs: 'EPSG:6933', strata},
        sampleAllocation: {allocation, minSamplesPerStratum, allocationStrategy, estimateSampleSize, manual},
        sampleArrangement
    }
})
const key = error => error?.userMessage?.key

describe('samplingDesignPreflightError', () => {
    it('accepts a design where every stratum requests at least the effective minimum', () => {
        expect(samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}, {stratum: 2, label: 'b', sampleSize: 2}]
        }))).toBeNull()
    })

    it('rejects a required seed of zero before any EE work', () => {
        const error = samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}],
            sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 0}
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.seedInvalid')
    })

    it('rejects an allocation when the stratification has no configured strata, before any EE work', () => {
        const error = samplingDesignPreflightError(recipe({
            strata: [],
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}]
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.noStrata')
    })

    it('rejects an allocation whose strata do not match the stratification, before any EE work', () => {
        const error = samplingDesignPreflightError(recipe({
            strata: [{stratum: 1, value: 1}, {stratum: 2, value: 2}],
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}, {stratum: 2, label: 'b', sampleSize: 10}, {stratum: 3, label: 'c', sampleSize: 10}]
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.strataMismatch')
    })

    it('rejects a stratum requesting fewer than 2 samples, whatever the configured minimum', () => {
        const error = samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'a', sampleSize: 10}, {stratum: 2, label: 'snow', sampleSize: 1}]
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum.samples')
        expect(error.userMessage.args).toEqual({floor: 2, strata: 'snow (1)'})
    })

    it('gives mode-specific actions when an allocation is below the statistical floor', () => {
        const allocation = [{stratum: 1, label: 'snow', sampleSize: 1}]
        const errorMode = samplingDesignPreflightError(recipe({allocation, estimateSampleSize: true}))
        expect(key(errorMode)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum.error')
        expect(errorMode.message).toContain('decrease Target margin of error')

        const manualMode = samplingDesignPreflightError(recipe({allocation, manual: [true]}))
        expect(key(manualMode)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum.manual')
        expect(manualMode.message).toContain('increase the sample count for each affected stratum')
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
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowConfiguredMinimum.samples')
        expect(error.userMessage.args).toEqual({minimum: 5, strata: 'snow (4)', value: 4, floor: 2})
    })

    it('tells Error mode to decrease the target margin when a larger total is needed', () => {
        const error = samplingDesignPreflightError(recipe({
            allocation: [{stratum: 1, label: 'snow', sampleSize: 4}],
            minSamplesPerStratum: 5,
            estimateSampleSize: true
        }))
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowConfiguredMinimum.error')
        expect(error.message).toContain('decrease Target margin of error')
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
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum.samples')
    })

    it('random export emits the structured preflight error without building an EE graph', async () => {
        const error = await lastValueFrom(exportRandomToAssets$({
            taskId: 't1', description: 'd', recipe: invalid, assetId: 'users/x/out', strategy: 'create', destination: 'GEE'
        })).catch(e => e)
        expect(key(error)).toBe('tasks.samplingDesign.preflight.belowStatisticalMinimum.samples')
    })
})
