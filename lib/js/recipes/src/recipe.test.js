import {
    getRecipeDefaults,
    getRecipeDescribeFacts,
    getRecipeEditFacts,
    getRecipeSchema,
    getRecipeSelectionFacts,
    getRecipeSpec,
    listRecipeSpecs,
    validateRecipe
} from './index.js'
import {COLLECTION_AVAILABILITY} from './opticalMosaic/collectionAvailability.js'

describe('recipe registry', () => {

    it('lists every registered recipe spec', () => {
        const specs = listRecipeSpecs()

        expect(specs.map(spec => spec.id)).toEqual(['MOSAIC'])
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRecipeSpec('UNKNOWN')).toBeNull()
        expect(getRecipeSchema('UNKNOWN')).toBeNull()
        expect(getRecipeDefaults('UNKNOWN')).toBeNull()
        expect(getRecipeSelectionFacts('UNKNOWN')).toBeNull()
        expect(getRecipeDescribeFacts('UNKNOWN')).toBeNull()
        expect(getRecipeEditFacts('UNKNOWN')).toBeNull()
    })

    it('getRecipeSelectionFacts delegates to the spec for a known id', () => {
        expect(getRecipeSelectionFacts('MOSAIC')).toEqual(getRecipeSpec('MOSAIC').selectionFacts())
    })

    it('getRecipeDescribeFacts delegates to the spec for a known id', () => {
        expect(getRecipeDescribeFacts('MOSAIC')).toEqual(getRecipeSpec('MOSAIC').describeFacts())
    })

    it('getRecipeEditFacts delegates to the spec for a known id', () => {
        expect(getRecipeEditFacts('MOSAIC')).toEqual(getRecipeSpec('MOSAIC').editFacts())
    })

    it('returns a structured error rather than throwing when validating an unknown id', () => {
        const errors = validateRecipe('UNKNOWN', {})

        expect(errors).toEqual([{path: '', message: 'Unknown recipe type: UNKNOWN', rule: 'unknownType'}])
    })
})

describe('optical mosaic (MOSAIC) spec', () => {

    function aValidModel() {
        return {
            ...getRecipeDefaults('MOSAIC'),
            aoi: {
                type: 'POLYGON',
                path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]
            }
        }
    }

    it('exposes the documented spec API', () => {
        const spec = getRecipeSpec('MOSAIC')

        expect(spec.id).toBe('MOSAIC')
        expect(typeof spec.defaultModel).toBe('function')
        expect(typeof spec.toEffectiveModel).toBe('function')
        expect(typeof spec.selectionFacts).toBe('function')
        expect(typeof spec.describeFacts).toBe('function')
        expect(typeof spec.editFacts).toBe('function')
        expect(typeof spec.validate).toBe('function')
        expect(spec.schema).toMatchObject({type: 'object'})
        expect(spec.rules.length).toBeGreaterThan(0)
        spec.rules.forEach(rule => {
            expect(typeof rule.name).toBe('string')
            expect(typeof rule.validate).toBe('function')
        })
    })

    it('produces defaults that validate against the schema + rules once a valid AOI is supplied', () => {
        const errors = validateRecipe('MOSAIC', aValidModel())

        expect(errors).toEqual([])
    })

    it('rejects a schema violation (corrections includes an unknown value)', () => {
        const model = aValidModel()
        model.compositeOptions.corrections = ['SR', 'BRDF', 'NOT_A_CORRECTION']

        const errors = validateRecipe('MOSAIC', model)

        expect(errors.length).toBeGreaterThan(0)
        expect(errors.some(error => error.rule === 'schema' && error.path.includes('/compositeOptions/corrections'))).toBe(true)
    })

    it('flags the mutually-exclusive SR + CALIBRATE rule', () => {
        const model = aValidModel()
        model.sources.dataSets = {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
        model.compositeOptions.corrections = ['SR', 'CALIBRATE']

        const errors = validateRecipe('MOSAIC', model)

        expect(errors.some(error => error.rule === 'srAndCalibrateMutuallyExclusive')).toBe(true)
    })

    describe('mixed Landsat + Sentinel-2 sources require SR or CALIBRATE', () => {

        function aMixedSourceModel(corrections) {
            const model = aValidModel()
            model.sources.dataSets = {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
            model.compositeOptions.corrections = corrections
            return model
        }

        it('accepts mixed sources with SR (no CALIBRATE)', () => {
            const errors = validateRecipe('MOSAIC', aMixedSourceModel(['SR', 'BRDF']))

            expect(errors).toEqual([])
        })

        it('accepts mixed sources with CALIBRATE (no SR)', () => {
            const errors = validateRecipe('MOSAIC', aMixedSourceModel(['CALIBRATE', 'BRDF']))

            expect(errors).toEqual([])
        })

        it('rejects mixed sources with neither SR nor CALIBRATE', () => {
            const errors = validateRecipe('MOSAIC', aMixedSourceModel(['BRDF']))

            const error = errors.find(e => e.path === '/compositeOptions/corrections')
            expect(error).toBeDefined()
            expect(error.message).toMatch(/surface reflectance.*cross-sensor calibration|SR.*CALIBRATE/i)
        })
    })

    it('flags a seasonStart that falls outside the targetDate window', () => {
        const model = aValidModel()
        model.dates.targetDate = '2024-07-02'
        model.dates.seasonStart = '2020-01-01'

        const errors = validateRecipe('MOSAIC', model)

        expect(errors.some(error => error.rule === 'seasonStartWindow' && error.path === '/dates/seasonStart')).toBe(true)
    })

    describe('dataset collection availability — selected datasets must have coverage within [seasonStart, seasonEnd)', () => {

        function aBareYearWindow(year, datasets) {
            const model = aValidModel()
            model.dates.targetDate = `${year}-07-02`
            model.dates.seasonStart = `${year}-01-01`
            model.dates.seasonEnd = `${year + 1}-01-01`
            model.sources.dataSets = datasets
            return model
        }

        function availabilityErrors(model) {
            return validateRecipe('MOSAIC', model)
                .filter(error => error.rule === 'datasetCollectionAvailability')
        }

        function addDays(dateString, days) {
            const [y, m, d] = dateString.split('-').map(Number)
            const date = new Date(Date.UTC(y, m - 1, d))
            date.setUTCDate(date.getUTCDate() + days)
            const yyyy = date.getUTCFullYear()
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
            const dd = String(date.getUTCDate()).padStart(2, '0')
            return `${yyyy}-${mm}-${dd}`
        }

        it('flags Landsat 9 selected for a 1995 calendar-year window', () => {
            const errors = availabilityErrors(aBareYearWindow(1995, {LANDSAT: ['LANDSAT_9']}))

            expect(errors).toHaveLength(1)
            expect(errors[0].path).toBe('/sources/dataSets')
            expect(errors[0].message).toContain('LANDSAT_9')
        })

        it('does not flag Landsat 4-5 (TM) selected for the same 1995 window', () => {
            const errors = availabilityErrors(aBareYearWindow(1995, {LANDSAT: ['LANDSAT_TM']}))

            expect(errors).toEqual([])
        })

        it('flags only the incompatible code when an array mixes valid and invalid datasets', () => {
            // Picker/updater can emit a mixed array; rescope-on-validation needs the
            // error to name only the bad code so the retry drops just that one.
            const errors = availabilityErrors(aBareYearWindow(1995, {LANDSAT: ['LANDSAT_TM', 'LANDSAT_9']}))

            expect(errors).toHaveLength(1)
            expect(errors[0].message).toContain('LANDSAT_9')
            expect(errors[0].message).not.toContain('LANDSAT_TM')
        })

        it('treats seasonEnd === collection start as no coverage (half-open window)', () => {
            const collectionStart = COLLECTION_AVAILABILITY.LANDSAT_9
            const model = aValidModel()
            model.dates.targetDate = addDays(collectionStart, -180)
            model.dates.seasonStart = addDays(collectionStart, -1)
            model.dates.seasonEnd = collectionStart
            model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}

            expect(availabilityErrors(model)).toHaveLength(1)
        })

        it('accepts a window whose end is one day past the collection start', () => {
            const collectionStart = COLLECTION_AVAILABILITY.LANDSAT_9
            const model = aValidModel()
            model.dates.targetDate = addDays(collectionStart, -180)
            model.dates.seasonStart = addDays(collectionStart, -1)
            model.dates.seasonEnd = addDays(collectionStart, 1)
            model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}

            expect(availabilityErrors(model)).toEqual([])
        })

        it('flags Sentinel-2 selected for a pre-collection window', () => {
            const errors = availabilityErrors(aBareYearWindow(2010, {SENTINEL_2: ['SENTINEL_2']}))

            expect(errors).toHaveLength(1)
            expect(errors[0].message).toContain('SENTINEL_2')
        })

        it('flags every incompatible code separately when both source groups predate their collections', () => {
            const errors = availabilityErrors(aBareYearWindow(1990, {
                LANDSAT: ['LANDSAT_8'],
                SENTINEL_2: ['SENTINEL_2']
            }))

            const codes = errors.map(error => error.message).join(' ')
            expect(errors).toHaveLength(2)
            expect(codes).toContain('LANDSAT_8')
            expect(codes).toContain('SENTINEL_2')
        })

        it('emits no error when seasonEnd is missing or unparseable (other rules own the date-shape contract)', () => {
            const model = aValidModel()
            model.dates.seasonEnd = 'not-a-date'
            model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}

            expect(availabilityErrors(model)).toEqual([])
        })
    })

    it('reports required-property schema errors with missingProperty so callers can resolve a usable path', () => {
        // Defaults lack aoi; AJV anchors the error at the container ('') with
        // the offending field in params.missingProperty. validate.js carries
        // that across so handle-resolution can compose <path>/<missingProperty>.
        const errors = validateRecipe('MOSAIC', getRecipeDefaults('MOSAIC'))

        const missingAoi = errors.find(error => error.rule === 'schema' && error.missingProperty === 'aoi')
        expect(missingAoi).toBeDefined()
        expect(missingAoi.path).toBe('')
    })

    it('also exposes validate() directly on the spec', () => {
        const errors = getRecipeSpec('MOSAIC').validate(aValidModel())

        expect(errors).toEqual([])
    })
})

describe('orchestrator tool-schema byte budget — DESIGN §3 target 15 KB', () => {

    // Visibility only — no assertion. Number lands in stdout so we can eyeball it as specs grow.
    it('reports the serialized schema size for each registered spec', () => {
        listRecipeSpecs().forEach(spec => {
            const bytes = JSON.stringify(spec.schema).length
            // eslint-disable-next-line no-console
            console.log(`recipe-schema-size ${spec.id} ${bytes}B`)
        })
    })
})
