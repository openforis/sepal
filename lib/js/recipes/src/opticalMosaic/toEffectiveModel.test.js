const {getRecipeSpec, getRecipeDefaults, validateRecipe, toEffectiveModel} = require('../index')

const MOSAIC = 'MOSAIC'

function aPolygonAoi() {
    return {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
}

function deepFreeze(value) {
    if (value === null || typeof value !== 'object') return value
    Object.values(value).forEach(deepFreeze)
    return Object.freeze(value)
}

function aStoredModelWithDormantFields() {
    // Mirrors the GUI's persisted shape for a LANDSAT-only MOSAIC where the
    // user previously parked a Sentinel-2 cloud method + its tuning. Defined
    // inline so this test file owns its own shape (no GUI import).
    return {
        ...getRecipeDefaults(MOSAIC),
        aoi: aPolygonAoi(),
        sources: {
            cloudPercentageThreshold: 75,
            dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}
        },
        compositeOptions: {
            corrections: ['SR', 'BRDF'],
            brdfMultiplier: 4,
            filters: [],
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
            sentinel2CloudScorePlusBand: 'cs_cdf',
            sentinel2CloudScorePlusMaxCloudProbability: 45,
            sentinel2CloudProbabilityMaxCloudProbability: 65,
            landsatCFMaskCloudMasking: 'MODERATE',
            landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE',
            landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            cloudBuffer: 0,
            holes: 'ALLOW',
            snowMasking: 'ON',
            compose: 'MEDOID'
        }
    }
}

describe('toEffectiveModel — top-level convenience', () => {

    it('returns the model unchanged for an unknown recipe id', () => {
        const input = {hello: 'world'}

        expect(toEffectiveModel('UNKNOWN', input)).toEqual(input)
    })

    it('delegates to the spec for a known recipe id', () => {
        const stored = aStoredModelWithDormantFields()

        const result = toEffectiveModel(MOSAIC, stored)

        expect(result.compositeOptions.includedCloudMasking).not.toContain('sentinel2CloudScorePlus')
    })
})

describe('MOSAIC.toEffectiveModel — purity and idempotence', () => {

    it('is pure: a deeply-frozen input does not throw and a new object is returned', () => {
        const spec = getRecipeSpec(MOSAIC)
        const frozen = deepFreeze(aStoredModelWithDormantFields())

        const out = spec.toEffectiveModel(frozen)

        expect(out).not.toBe(frozen)
        expect(out.compositeOptions).not.toBe(frozen.compositeOptions)
    })

    it('is idempotent on a stored sample: toEffectiveModel(toEffectiveModel(m)) deep-equals toEffectiveModel(m)', () => {
        const spec = getRecipeSpec(MOSAIC)
        const stored = aStoredModelWithDormantFields()

        const once = spec.toEffectiveModel(stored)
        const twice = spec.toEffectiveModel(once)

        expect(twice).toEqual(once)
    })

    it('is idempotent on defaults: toEffectiveModel(defaultModel()) deep-equals defaultModel() — the default is already effective', () => {
        const spec = getRecipeSpec(MOSAIC)
        const defaults = spec.defaultModel()

        expect(spec.toEffectiveModel(defaults)).toEqual(defaults)
    })
})

describe('MOSAIC.toEffectiveModel — projection rules', () => {

    // Shallow merge: a subtree override (e.g. compositeOptions) fully replaces
    // the corresponding subtree. Spread aStoredModelWithDormantFields()'s
    // subtree inside the override when preserving siblings matters.
    function projected(overrides = {}) {
        const spec = getRecipeSpec(MOSAIC)
        return spec.toEffectiveModel({...aStoredModelWithDormantFields(), ...overrides})
    }

    it('rule 1: strips includedCloudMasking entries whose required source is absent', () => {
        // LANDSAT-only stored default, so sentinel2CloudScorePlus must go.
        const out = projected()

        expect(out.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore', 'landsatCFMask'])
    })

    it('rule 1: strips landsatCFMask when LANDSAT is absent', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {SENTINEL_2: ['SENTINEL_2']}},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['BRDF', 'CALIBRATE'],
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask']
            }
        })

        expect(out.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore'])
    })

    it('rule 1: strips pino26 when LANDSAT is present (S2-only requirement)', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {
                LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']
            }},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['BRDF', 'CALIBRATE'],
                includedCloudMasking: ['sepalCloudScore', 'pino26']
            }
        })

        expect(out.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore'])
    })

    it('rule 1: strips pino26 when SR is in corrections (no-SR requirement)', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {SENTINEL_2: ['SENTINEL_2']}},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['SR', 'BRDF'],
                includedCloudMasking: ['sepalCloudScore', 'pino26']
            }
        })

        expect(out.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore'])
    })

    it('rule 1: keeps sepalCloudScore unconditionally (universal method)', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                includedCloudMasking: ['sepalCloudScore']
            }
        })

        expect(out.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore'])
    })

    it('rule 2: strips sentinel2CloudScorePlus tuning fields when method dropped', () => {
        const out = projected()

        expect(out.compositeOptions).not.toHaveProperty('sentinel2CloudScorePlusBand')
        expect(out.compositeOptions).not.toHaveProperty('sentinel2CloudScorePlusMaxCloudProbability')
    })

    it('rule 2: strips sentinel2CloudProbability tuning when method not present', () => {
        const out = projected()

        expect(out.compositeOptions).not.toHaveProperty('sentinel2CloudProbabilityMaxCloudProbability')
    })

    it('rule 2: strips landsatCFMask tuning when method dropped', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {SENTINEL_2: ['SENTINEL_2']}},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['BRDF', 'CALIBRATE'],
                includedCloudMasking: ['sepalCloudScore']
            }
        })

        expect(out.compositeOptions).not.toHaveProperty('landsatCFMaskCloudMasking')
        expect(out.compositeOptions).not.toHaveProperty('landsatCFMaskCloudShadowMasking')
        expect(out.compositeOptions).not.toHaveProperty('landsatCFMaskCirrusMasking')
        expect(out.compositeOptions).not.toHaveProperty('landsatCFMaskDilatedCloud')
    })

    it('rule 2: strips sepalCloudScoreMaxCloudProbability when method dropped', () => {
        const out = projected({
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                includedCloudMasking: ['landsatCFMask']
            }
        })

        expect(out.compositeOptions).not.toHaveProperty('sepalCloudScoreMaxCloudProbability')
    })

    it('rule 3: strips brdfMultiplier when corrections does not include BRDF', () => {
        const out = projected({
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['SR']
            }
        })

        expect(out.compositeOptions).not.toHaveProperty('brdfMultiplier')
    })

    it('rule 3: keeps brdfMultiplier when corrections includes BRDF', () => {
        const out = projected()

        expect(out.compositeOptions.brdfMultiplier).toBe(4)
    })

    it('rule 3b: canonicalizes mixed-source corrections to CALIBRATE without SR', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {
                LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']
            }},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['SR', 'BRDF']
            }
        })

        expect(out.compositeOptions.corrections).toEqual(['BRDF', 'CALIBRATE'])
    })

    it('rule 3b: removes CALIBRATE when only one source group is present', () => {
        const out = projected({
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['SR', 'BRDF', 'CALIBRATE']
            }
        })

        expect(out.compositeOptions.corrections).toEqual(['SR', 'BRDF'])
    })

    it('rule 4: strips scenes when sceneSelectionOptions.type !== SELECT', () => {
        const out = projected({
            sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
            scenes: {'21KZA': [{id: 'some-scene'}]}
        })

        expect(out).not.toHaveProperty('scenes')
    })

    it('rule 4: keeps scenes when sceneSelectionOptions.type === SELECT', () => {
        const out = projected({
            sceneSelectionOptions: {type: 'SELECT', targetDateWeight: 0.5},
            scenes: {'21KZA': [{id: 'some-scene'}]}
        })

        expect(out.scenes).toEqual({'21KZA': [{id: 'some-scene'}]})
    })

    it('rule 4: forces ALL scenes when both source groups are selected', () => {
        const out = projected({
            sources: {cloudPercentageThreshold: 75, dataSets: {
                LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']
            }},
            sceneSelectionOptions: {type: 'SELECT', targetDateWeight: 0.5},
            scenes: {'21KZA': [{id: 'some-scene'}]}
        })

        expect(out.sceneSelectionOptions.type).toBe('ALL')
        expect(out).not.toHaveProperty('scenes')
    })

    it('does not strip orbitOverlap or tileOverlap even when there is no SENTINEL_2 (schema requires them unconditionally)', () => {
        const out = projected()

        expect(out.compositeOptions.orbitOverlap).toBe('KEEP')
        expect(out.compositeOptions.tileOverlap).toBe('QUICK_REMOVE')
    })

    it('canonicalizes the legacy/default cloudBuffering field to the GUI cloudBuffer field', () => {
        const out = projected({
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                cloudBuffer: undefined,
                cloudBuffering: 120
            }
        })

        expect(out.compositeOptions.cloudBuffer).toBe(120)
        expect(out.compositeOptions).not.toHaveProperty('cloudBuffering')
    })
})

describe('MOSAIC.toEffectiveModel — validation round-trip', () => {

    it('a stored sample with dormant fields validates clean after projection', () => {
        const stored = aStoredModelWithDormantFields()

        const effective = getRecipeSpec(MOSAIC).toEffectiveModel(stored)

        expect(validateRecipe(MOSAIC, effective)).toEqual([])
    })

    it('a mixed-source GUI-shaped sample validates clean after projection', () => {
        const stored = {
            ...aStoredModelWithDormantFields(),
            sources: {cloudPercentageThreshold: 75, dataSets: {
                LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']
            }},
            sceneSelectionOptions: {type: 'SELECT', targetDateWeight: 0.5},
            scenes: {'21KZA': [{id: 'some-scene'}]},
            compositeOptions: {
                ...aStoredModelWithDormantFields().compositeOptions,
                corrections: ['SR', 'BRDF'],
                cloudBuffering: 0
            }
        }

        const effective = getRecipeSpec(MOSAIC).toEffectiveModel(stored)

        expect(validateRecipe(MOSAIC, effective)).toEqual([])
    })
})

describe('MOSAIC.toEffectiveModel — edges', () => {

    it('does not throw when sources.dataSets is missing', () => {
        const broken = {compositeOptions: {includedCloudMasking: ['sepalCloudScore', 'landsatCFMask']}}

        expect(() => getRecipeSpec(MOSAIC).toEffectiveModel(broken)).not.toThrow()
    })

    it('returns an empty includedCloudMasking unchanged (nothing to strip)', () => {
        const out = getRecipeSpec(MOSAIC).toEffectiveModel({
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
            compositeOptions: {corrections: ['SR'], includedCloudMasking: []}
        })

        expect(out.compositeOptions.includedCloudMasking).toEqual([])
    })

    it('does not throw when compositeOptions is missing', () => {
        expect(() => getRecipeSpec(MOSAIC).toEffectiveModel({})).not.toThrow()
    })
})
