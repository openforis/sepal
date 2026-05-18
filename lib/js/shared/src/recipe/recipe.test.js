const {
    listRecipeSpecs,
    getRecipeSpec,
    getRecipeSchema,
    getRecipeDefaults,
    validateRecipe
} = require('./index')

describe('recipe registry', () => {

    it('lists every registered recipe spec', () => {
        const specs = listRecipeSpecs()

        expect(specs.map(spec => spec.id)).toEqual(['MOSAIC'])
    })

    it('returns null for an unknown recipe id', () => {
        expect(getRecipeSpec('UNKNOWN')).toBeNull()
        expect(getRecipeSchema('UNKNOWN')).toBeNull()
        expect(getRecipeDefaults('UNKNOWN')).toBeNull()
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

    it('exposes id, defaultModel(), validate(), schema, and a non-empty rules list', () => {
        const spec = getRecipeSpec('MOSAIC')

        expect(spec.id).toBe('MOSAIC')
        expect(typeof spec.defaultModel).toBe('function')
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

    it('flags a seasonStart that falls outside the targetDate window', () => {
        const model = aValidModel()
        model.dates.targetDate = '2024-07-02'
        model.dates.seasonStart = '2020-01-01'

        const errors = validateRecipe('MOSAIC', model)

        expect(errors.some(error => error.rule === 'seasonStartWindow' && error.path === '/dates/seasonStart')).toBe(true)
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
