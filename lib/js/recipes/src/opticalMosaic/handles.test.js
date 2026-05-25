const {getHandles} = require('./handles')

const REQUIRED_V1_HANDLES = [
    // source / render speed
    'datasets', 'sceneCloudLimit', 'corrections', 'sceneSelection',
    'filters', 'compose', 'tileOverlap', 'orbitOverlap',
    // cloud masking
    'cloudMethods', 'sepalCloudScoreMax', 's2CloudScoreBand',
    's2CloudScoreMax', 's2CloudProbabilityMax', 'landsatCloudMask',
    'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud',
    'snowMasking', 'holes', 'cloudBuffer',
    // BRDF / date basics
    'brdfMultiplier', 'targetDate', 'seasonStart', 'seasonEnd',
    'yearsBefore', 'yearsAfter'
]

describe('MOSAIC.handles — required v1 catalog', () => {

    function names() {
        return getHandles().map(handle => handle.name)
    }

    function byName(name) {
        return getHandles().find(handle => handle.name === name)
    }

    it.each(REQUIRED_V1_HANDLES)('exposes the required v1 handle %s', name => {
        expect(names()).toContain(name)
    })

    it('produces unique handle names', () => {
        const seen = names()
        expect(seen.length).toBe(new Set(seen).size)
    })

    it('produces unique internal paths', () => {
        const paths = getHandles().map(handle => handle.path)
        expect(paths.length).toBe(new Set(paths).size)
    })

    it('returns short lower-camel handle names', () => {
        for (const name of names()) {
            expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/)
        }
    })

    it('returns fresh objects each call so consumers cannot mutate the source', () => {
        const first = getHandles()
        first.push({name: 'injected', path: '/x'})
        first[0].path = '/mutated'

        const second = getHandles()
        expect(second.some(handle => handle.name === 'injected')).toBe(false)
        expect(second[0].path).not.toBe('/mutated')
    })

    describe('handle->path mapping', () => {

        it.each([
            ['datasets', '/sources/dataSets'],
            ['sceneCloudLimit', '/sources/cloudPercentageThreshold'],
            ['corrections', '/compositeOptions/corrections'],
            ['sceneSelection', '/sceneSelectionOptions/type'],
            ['filters', '/compositeOptions/filters'],
            ['compose', '/compositeOptions/compose'],
            ['tileOverlap', '/compositeOptions/tileOverlap'],
            ['orbitOverlap', '/compositeOptions/orbitOverlap'],
            ['cloudMethods', '/compositeOptions/includedCloudMasking'],
            ['sepalCloudScoreMax', '/compositeOptions/sepalCloudScoreMaxCloudProbability'],
            ['s2CloudScoreBand', '/compositeOptions/sentinel2CloudScorePlusBand'],
            ['s2CloudScoreMax', '/compositeOptions/sentinel2CloudScorePlusMaxCloudProbability'],
            ['s2CloudProbabilityMax', '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability'],
            ['landsatCloudMask', '/compositeOptions/landsatCFMaskCloudMasking'],
            ['landsatShadowMask', '/compositeOptions/landsatCFMaskCloudShadowMasking'],
            ['landsatCirrusMask', '/compositeOptions/landsatCFMaskCirrusMasking'],
            ['landsatDilatedCloud', '/compositeOptions/landsatCFMaskDilatedCloud'],
            ['snowMasking', '/compositeOptions/snowMasking'],
            ['holes', '/compositeOptions/holes'],
            ['cloudBuffer', '/compositeOptions/cloudBuffer'],
            ['brdfMultiplier', '/compositeOptions/brdfMultiplier'],
            ['targetDate', '/dates/targetDate'],
            ['seasonStart', '/dates/seasonStart'],
            ['seasonEnd', '/dates/seasonEnd'],
            ['yearsBefore', '/dates/yearsBefore'],
            ['yearsAfter', '/dates/yearsAfter']
        ])('%s -> %s', (name, path) => {
            expect(byName(name)?.path).toBe(path)
        })

        it('maps datasets to the whole source-membership object, not to a per-group child', () => {
            expect(byName('datasets').path).toBe('/sources/dataSets')
        })

        it('maps filters to the whole filters array, not to per-item handles', () => {
            expect(byName('filters').path).toBe('/compositeOptions/filters')
            const handles = getHandles()
            expect(handles.filter(handle => handle.path.startsWith('/compositeOptions/filters/'))).toEqual([])
        })

        it('does not expose any handle whose path indexes into an array (no per-array-item handles)', () => {
            for (const handle of getHandles()) {
                expect(handle.path).not.toMatch(/\/\d+(\/|$)/)
            }
        })
    })

    describe('granularity rules — no group handles, no 1-to-many handles', () => {

        const FORBIDDEN_GROUP_NAMES = ['cloudMasking', 'performance', 'render', 'dateWindow', 'season']

        it.each(FORBIDDEN_GROUP_NAMES)('does not expose group handle %s', name => {
            expect(names()).not.toContain(name)
        })

        it('declares exactly one path per handle (no 1-to-many handles in v1)', () => {
            for (const handle of getHandles()) {
                expect(typeof handle.path).toBe('string')
                expect(handle).not.toHaveProperty('paths')
            }
        })
    })

    describe('handle metadata content', () => {

        it('provides a non-empty description for every handle', () => {
            for (const handle of getHandles()) {
                expect(typeof handle.description).toBe('string')
                expect(handle.description.trim().length).toBeGreaterThan(0)
            }
        })

        it('declares allowedValues for the enum-bearing handles', () => {
            expect(byName('compose').allowedValues).toEqual(['MEDOID', 'MEDIAN'])
            expect(byName('snowMasking').allowedValues).toEqual(['ON', 'OFF'])
            expect(byName('holes').allowedValues).toEqual(['PREVENT', 'ALLOW'])
            expect(byName('tileOverlap').allowedValues).toEqual(['KEEP', 'QUICK_REMOVE', 'REMOVE'])
            expect(byName('orbitOverlap').allowedValues).toEqual(['KEEP', 'REMOVE'])
            expect(byName('cloudBuffer').allowedValues).toEqual([0, 120, 600])
            expect(byName('sceneSelection').allowedValues).toEqual(['ALL', 'SELECT'])
            expect(byName('s2CloudScoreBand').allowedValues).toEqual(['cs', 'cs_cdf'])
            for (const name of ['landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask']) {
                expect(byName(name).allowedValues).toEqual(['OFF', 'MODERATE', 'AGGRESSIVE'])
            }
            expect(byName('landsatDilatedCloud').allowedValues).toEqual(['KEEP', 'REMOVE'])
        })

        it('declares allowed items for the cloudMethods array handle', () => {
            expect(byName('cloudMethods').allowedItems).toEqual([
                'sepalCloudScore', 'landsatCFMask',
                'sentinel2CloudScorePlus', 'sentinel2CloudProbability', 'pino26'
            ])
        })

        it('declares allowed items for the corrections array handle', () => {
            expect(byName('corrections').allowedItems).toEqual(['SR', 'BRDF', 'CALIBRATE'])
        })
    })
})
