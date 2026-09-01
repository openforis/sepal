import {describe, expect, it, vi} from 'vitest'

// The generic Retrieve submitter, exercised directly. Only its boundaries are replaced - the task API, the
// recipe-type registry, the task-info builder, visualizations, translations and analytics - so what runs is
// the submitter's own logic.
//
// Nothing is rendered and no component is mounted or inspected.
//
// A synthetic recipe type rather than a real one: what is under test is what the submitter does when a type
// declares a date-range provider, declares one that answers nothing, or declares none at all. Naming a real
// recipe would tie these witnesses to whatever that recipe happens to provide today.

const state = vi.hoisted(() => ({
    submitted: [],
    recipeType: null,
    events: []
}))

vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                state.submitted.push(task)
                return {subscribe: () => ({unsubscribe: () => {}})}
            }
        }
    }
}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => state.recipeType
}))

vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({
    // Echoes its argument so a witness can tell which options reached task-info construction.
    getTaskInfo: ({retrieveOptions}) => ({retrieveOptions})
}))

vi.mock('~/app/home/body/process/recipe/visualizations', () => ({
    getAllVisualizations: () => []
}))

vi.mock('~/eventPublisher', () => ({
    publishEvent: (event, props) => state.events.push({event, props})
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {submitRetrieveRecipeTask} = await import('./recipeTaskSubmitter')

const recipe = () => ({
    id: 'recipe-1',
    projectId: 'project-1',
    type: 'SYNTHETIC',
    title: 'A synthetic recipe',
    model: {dates: {startDate: '2020-01-01'}},
    ui: {retrieveOptions: {destination: 'GEE', bands: ['band-1']}}
})

const submit = (recipeType, config) => {
    state.submitted = []
    state.events = []
    state.recipeType = recipeType
    submitRetrieveRecipeTask(recipe(), config)
    return state.submitted
}

const propertiesOf = ([task]) => task.params.image.properties

const imageOf = ([task]) => task.params.image

const submitRecipe = (recipeInstance, config) => {
    state.submitted = []
    state.events = []
    state.recipeType = {id: 'SYNTHETIC'}
    submitRetrieveRecipeTask(recipeInstance, config)
    return state.submitted
}

const outerRecipe = (bands, destination = 'GEE') => ({
    id: 'masked-1',
    projectId: 'project-1',
    type: 'SYNTHETIC',
    title: 'An outer recipe',
    model: {},
    ui: {retrieveOptions: {destination, bands}}
})

const band = (name, pyramidingPolicy, dataType = {arrayDimensions: 0}) => ({
    name,
    ...(dataType !== undefined && {dataType}),
    ...(pyramidingPolicy !== undefined && {pyramidingPolicy})
})

const resolved = ({id = 'masked-1', bands}) => ({
    executionReference: {type: 'RECIPE_REF', id},
    output: {kind: 'IMAGE', bands},
    evidence: []
})

// A value the submitter is expected to reduce through valueOf(), like the moment instances real providers
// return - so a witness can tell "the range was read" from "the range object was passed through".
const instant = millis => ({valueOf: () => millis})

describe('submitRetrieveRecipeTask', () => {
    // The defect. A recipe type that declares no date-range provider is a legitimate type - Masking is one -
    // and Retrieve calls the provider unconditionally, so submitting one throws before a task is ever built.
    it('submits a recipe type that declares no date range', () => {
        const submitted = submit({id: 'SYNTHETIC'})
        expect(submitted).toHaveLength(1)
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_start')
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_end')
    })

    // The reason the fix cannot be optional chaining all the way down. Only the PROVIDER is optional: a type
    // the registry does not know is not a type that declares no date range, and guarding the lookup as well
    // would make the two indistinguishable.
    //
    // Scoped to the path that asks for time metadata. With includeTimeRange false the submitter never
    // consults the registry at all, so an unregistered type still submits - existing behavior, outside this
    // packet, and deliberately left unpinned.
    it('does not treat an unregistered type as one without a date-range provider', () => {
        expect(() => submit(undefined)).toThrow()
        expect(state.submitted).toHaveLength(0)
    })

    // Compatibility: a type that does provide a range keeps writing it, reduced through valueOf, and the
    // provider is given the recipe to derive it from.
    it('writes the range a provider returns', () => {
        const getDateRange = vi.fn(() => [instant(1000), instant(2000)])
        const submitted = submit({id: 'SYNTHETIC', getDateRange})

        expect(getDateRange).toHaveBeenCalledTimes(1)
        expect(getDateRange.mock.calls[0][0]).toMatchObject({id: 'recipe-1', type: 'SYNTHETIC'})
        expect(propertiesOf(submitted)['system:time_start']).toBe(1000)
        expect(propertiesOf(submitted)['system:time_end']).toBe(2000)
    })

    // A provider that has nothing to say is not an error. A recipe can be configured such that no range is
    // derivable yet, and the export is still valid without the two properties.
    it.each([
        ['undefined', undefined],
        ['null', null],
        ['an empty range', []]
    ])('omits both properties when the provider returns %s', (_name, range) => {
        const submitted = submit({id: 'SYNTHETIC', getDateRange: () => range})
        expect(submitted).toHaveLength(1)
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_start')
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_end')
    })

    // Callers that opt out must not pay for the provider at all: asking a recipe for a range it was told not
    // to include is work at best and a crash at worst.
    it('never asks for a range when the caller opted out', () => {
        const getDateRange = vi.fn(() => [instant(1000), instant(2000)])
        const submitted = submit({id: 'SYNTHETIC', getDateRange}, {includeTimeRange: false})

        expect(getDateRange).not.toHaveBeenCalled()
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_start')
        expect(propertiesOf(submitted)).not.toHaveProperty('system:time_end')
    })
})

// The resolved IMAGE_OUTPUT description as the authority for export requirements. Synthetic throughout: what
// is under test is the conversion from a description to the task payload, not any recipe type's behavior.
//
// Rejections assert the category and that nothing was submitted, not the wording - the messages are
// developer-facing and not a contract anyone may depend on.
describe('submitRetrieveRecipeTask with a resolved image output', () => {
    it('carries each declared policy for the selected bands', () => {
        const submitted = submitRecipe(outerRecipe(['tStart', 'ndvi_coefs']), {
            imageOutputDescription: resolved({
                bands: [band('tStart', 'sample'), band('ndvi_coefs', 'sample')]
            })
        })

        expect(submitted).toHaveLength(1)
        expect(imageOf(submitted).pyramidingPolicy).toEqual({tStart: 'sample', ndvi_coefs: 'sample'})
    })

    it('carries a different policy per band', () => {
        const submitted = submitRecipe(outerRecipe(['class', 'probability', 'coefs']), {
            imageOutputDescription: resolved({
                bands: [band('class', 'mode'), band('probability', 'mean'), band('coefs', 'sample')]
            })
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({
            class: 'mode',
            probability: 'mean',
            coefs: 'sample'
        })
    })

    it('describes only the selected bands, keeping the selection as submitted', () => {
        const submitted = submitRecipe(outerRecipe(['coefs', 'class']), {
            imageOutputDescription: resolved({
                bands: [
                    band('class', 'mode'),
                    band('probability', 'mean'),
                    band('coefs', 'sample'),
                    band('rmse', 'mean')
                ]
            })
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({coefs: 'sample', class: 'mode'})
        expect(imageOf(submitted).bands).toEqual({selection: ['coefs', 'class']})
    })

    // Order is schema, not correspondence. Matching by position would pair each selected band with whichever
    // descriptor happened to sit at the same index, which here swaps the two policies.
    it('matches by name when the description order differs from the selection order', () => {
        const submitted = submitRecipe(outerRecipe(['class', 'coefs']), {
            imageOutputDescription: resolved({
                bands: [band('coefs', 'sample'), band('class', 'mode')]
            })
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({class: 'mode', coefs: 'sample'})
    })

    // Policies are carried verbatim. A whitelist would reject a policy Earth Engine gains before SEPAL
    // learns about it, and inferring one from the name is the coupling this whole contract removes.
    it('carries an unrecognised policy string through untouched', () => {
        const submitted = submitRecipe(outerRecipe(['class']), {
            imageOutputDescription: resolved({bands: [band('class', 'someFuturePolicy')]})
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({class: 'someFuturePolicy'})
    })

    // An empty or absent selection means all bands, which is what `useAllBands` submits. Describing none of
    // them would export every band under Earth Engine's default policy - the masked-CCDC failure again,
    // reached through the all-bands path instead of the selected one.
    it.each([
        ['an empty selection', []],
        ['an absent selection', undefined]
    ])('describes every band in the description for %s', (_name, selection) => {
        const submitted = submitRecipe(outerRecipe(selection), {
            imageOutputDescription: resolved({
                bands: [band('coefs', 'sample'), band('class', 'mode')]
            })
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({coefs: 'sample', class: 'mode'})
        expect(imageOf(submitted).bands).toEqual({selection})
    })

    // Dropping it would export a band with Earth Engine's default policy while reporting success, and
    // inventing one would be the guess the description exists to avoid.
    it('rejects a selected band the description does not describe', () => {
        expect(() => submitRecipe(outerRecipe(['class', 'ghost']), {
            imageOutputDescription: resolved({bands: [band('class', 'mode')]})
        })).toThrow(/band/)
        expect(state.submitted).toHaveLength(0)
    })

    // A Masking over CCDC resolves CCDC's bands, but the recipe being submitted is the Masking. A
    // description carrying the inner reference is evidence about a different execution.
    it('rejects a description whose execution reference is not the submitted recipe', () => {
        expect(() => submitRecipe(outerRecipe(['tStart']), {
            imageOutputDescription: resolved({id: 'ccdc-1', bands: [band('tStart', 'sample')]})
        })).toThrow(/execution/)
        expect(state.submitted).toHaveLength(0)
    })

    // Identity is the pair, not the id. An asset and a recipe can share a string, and only a recipe is
    // being submitted here.
    it('rejects a description whose execution reference is not a recipe', () => {
        expect(() => submitRecipe(outerRecipe(['tStart']), {
            imageOutputDescription: {
                executionReference: {type: 'ASSET', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: [band('tStart', 'sample')]},
                evidence: []
            }
        })).toThrow(/execution/)
        expect(state.submitted).toHaveLength(0)
    })

    // Two authorities for one decision is the defect this milestone removes, so their coexistence is a
    // configuration mistake rather than a precedence question to answer silently.
    it('rejects a resolved description alongside a legacy policy', () => {
        expect(() => submitRecipe(outerRecipe(['class']), {
            imageOutputDescription: resolved({bands: [band('class', 'mode')]}),
            pyramidingPolicy: {'.default': 'sample'}
        })).toThrow(/policy/)
        expect(state.submitted).toHaveLength(0)
    })

    it('does not modify the recipe, the description or their arrays', () => {
        const recipeInstance = outerRecipe(['class', 'coefs'])
        const description = resolved({bands: [band('coefs', 'sample'), band('class', 'mode')]})
        const before = JSON.stringify({recipeInstance, description})
        const selection = recipeInstance.ui.retrieveOptions.bands

        const submitted = submitRecipe(recipeInstance, {imageOutputDescription: description})

        expect(imageOf(submitted).pyramidingPolicy).toEqual({class: 'mode', coefs: 'sample'})
        expect(JSON.stringify({recipeInstance, description})).toEqual(before)
        expect(recipeInstance.ui.retrieveOptions.bands).toBe(selection)
    })
})

describe('submitRetrieveRecipeTask destination validation over resolved physical schema', () => {
    const mixedBands = [
        band('array', 'sample', {arrayDimensions: 1}),
        band('scalar', undefined, {arrayDimensions: 0})
    ]
    const description = resolved({bands: mixedBands})

    const submitSelection = ({destination, bands, useAllBands, output = description}) =>
        submitRecipe(outerRecipe(['stored'], 'SEPAL'), {
            retrieveOptions: {
                destination,
                bands,
                ...(useAllBands !== undefined && {useAllBands})
            },
            imageOutputDescription: output
        })

    it('submits selected array bands to Earth Engine under their resolved sample policy', () => {
        const submitted = submitSelection({destination: 'GEE', bands: ['array']})

        expect(imageOf(submitted).pyramidingPolicy).toEqual({array: 'sample'})
        expect(imageOf(submitted).bands).toEqual({selection: ['array']})
    })

    it.each(['DRIVE', 'SEPAL'])('rejects selected array bands for the %s scalar renderer', destination => {
        expect(() => submitSelection({destination, bands: ['array']})).toThrow(/array|dimension|band/i)
        expect(state.submitted).toEqual([])
    })

    it.each(['DRIVE', 'SEPAL'])('allows selected scalar bands for %s without requiring or sending a policy', destination => {
        const submitted = submitSelection({destination, bands: ['scalar']})

        expect(submitted).toHaveLength(1)
        expect(imageOf(submitted).bands).toEqual({selection: ['scalar']})
        expect(imageOf(submitted)).not.toHaveProperty('pyramidingPolicy')
    })

    it('treats a scalar policy as irrelevant for a non-Earth-Engine destination', () => {
        const submitted = submitSelection({
            destination: 'DRIVE',
            bands: ['scalar'],
            output: resolved({bands: [band('scalar', 'mean', {arrayDimensions: 0})]})
        })

        expect(imageOf(submitted)).not.toHaveProperty('pyramidingPolicy')
    })

    it('rejects a selected scalar band with unknown policy for Earth Engine', () => {
        expect(() => submitSelection({destination: 'GEE', bands: ['scalar']})).toThrow(/policy|band/i)
        expect(state.submitted).toEqual([])
    })

    it.each([
        ['GEE', []],
        ['GEE', undefined],
        ['DRIVE', []],
        ['SEPAL', undefined]
    ])('validates every described band when %s receives an all-band selection', (destination, bands) => {
        expect(() => submitSelection({destination, bands})).toThrow(/array|dimension|policy|band/i)
        expect(state.submitted).toEqual([])
    })

    it.each(['DRIVE', 'SEPAL'])('does not treat unknown dimensionality as scalar for %s', destination => {
        expect(() => submitSelection({
            destination,
            bands: ['unknown'],
            output: resolved({bands: [{name: 'unknown', pyramidingPolicy: 'sample'}]})
        })).toThrow(/dimension|band/i)
        expect(state.submitted).toEqual([])
    })

    it('uses every described band when useAllBands is explicit, ignoring a stale scalar selection', () => {
        expect(() => submitSelection({
            destination: 'DRIVE',
            bands: ['scalar'],
            useAllBands: true
        })).toThrow(/array|dimension|band/i)
        expect(state.submitted).toEqual([])
    })

    it('submits every described band when useAllBands is explicit, ignoring a stale manual selection', () => {
        const submitted = submitSelection({
            destination: 'GEE',
            bands: ['scalar'],
            useAllBands: true,
            output: resolved({bands: [
                band('first', 'sample', {arrayDimensions: 1}),
                band('second', 'mean', {arrayDimensions: 0})
            ]})
        })

        expect(imageOf(submitted).bands).toEqual({selection: ['first', 'second']})
        expect(imageOf(submitted).pyramidingPolicy).toEqual({first: 'sample', second: 'mean'})
    })

    it('rejects an explicitly empty manual selection instead of treating it as all bands', () => {
        expect(() => submitSelection({
            destination: 'DRIVE',
            bands: [],
            useAllBands: false,
            output: resolved({bands: [band('scalar', undefined, {arrayDimensions: 0})]})
        })).toThrow(/selection|band/i)
        expect(state.submitted).toEqual([])
    })
})

// The fallback is temporary migration authority supplied separately from observed evidence. It may complete
// missing scalar GEE policies, but it cannot replace resolved policies or relax physical-schema validation.
describe('submitRetrieveRecipeTask with resolved output and a migration fallback', () => {
    const mixedOutput = () => resolved({
        bands: [
            band('array', 'sample', {arrayDimensions: 1}),
            band('scalar', undefined, {arrayDimensions: 0})
        ]
    })

    it('fills a missing selected scalar policy for Earth Engine', () => {
        const fallbackPyramidingPolicy = vi.fn(names => Object.fromEntries(names.map(name => [name, 'mean'])))
        const submitted = submitRecipe(outerRecipe(['scalar']), {
            imageOutputDescription: mixedOutput(),
            fallbackPyramidingPolicy
        })

        expect(fallbackPyramidingPolicy).toHaveBeenCalledOnce()
        expect(fallbackPyramidingPolicy).toHaveBeenCalledWith(['scalar'])
        expect(imageOf(submitted).pyramidingPolicy).toEqual({scalar: 'mean'})
    })

    it('keeps resolved policies when filling missing scalar policies', () => {
        const fallbackPyramidingPolicy = vi.fn(() => ({array: 'mean', scalar: 'mode', outside: 'mean'}))
        const submitted = submitRecipe(outerRecipe(['array', 'scalar']), {
            imageOutputDescription: mixedOutput(),
            fallbackPyramidingPolicy
        })

        expect(fallbackPyramidingPolicy).toHaveBeenCalledWith(['scalar'])
        expect(imageOf(submitted).pyramidingPolicy).toEqual({array: 'sample', scalar: 'mode'})
    })

    it.each([
        ['an empty selection', []],
        ['an absent selection', undefined]
    ])('selects every described band before applying fallback for %s', (_name, bands) => {
        const fallbackPyramidingPolicy = vi.fn(() => ({scalar: 'mean'}))
        const submitted = submitRecipe(outerRecipe(bands), {
            imageOutputDescription: mixedOutput(),
            fallbackPyramidingPolicy
        })

        expect(fallbackPyramidingPolicy).toHaveBeenCalledWith(['scalar'])
        expect(imageOf(submitted).pyramidingPolicy).toEqual({array: 'sample', scalar: 'mean'})
        expect(imageOf(submitted).bands).toEqual({selection: bands})
    })

    it('uses a valid object fallback to fill a missing scalar policy', () => {
        const submitted = submitRecipe(outerRecipe(['scalar']), {
            imageOutputDescription: mixedOutput(),
            fallbackPyramidingPolicy: {scalar: 'mode', '.default': 'mean'}
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({scalar: 'mode'})
    })

    it('uses an object default to fill a missing scalar policy', () => {
        const submitted = submitRecipe(outerRecipe(['scalar']), {
            imageOutputDescription: mixedOutput(),
            fallbackPyramidingPolicy: {'.default': 'mean'}
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({scalar: 'mean'})
    })

    it.each([
        ['an incomplete object', {first: 'mean'}],
        ['an object with a blank band-specific override', {first: 'mean', second: ' ', '.default': 'mean'}],
        ['an incomplete function result', () => ({first: 'mean', second: ''})]
    ])('blocks when %s does not supply every missing scalar policy', (_name, fallbackPyramidingPolicy) => {
        expect(() => submitRecipe(outerRecipe(['first', 'second']), {
            imageOutputDescription: resolved({
                bands: [
                    band('first', undefined, {arrayDimensions: 0}),
                    band('second', undefined, {arrayDimensions: 0})
                ]
            }),
            fallbackPyramidingPolicy
        })).toThrow(/fallback|policy|band/i)
        expect(state.submitted).toEqual([])
    })

    it('does not consult fallback when every selected policy is resolved', () => {
        const fallbackPyramidingPolicy = vi.fn(() => ({scalar: 'mean'}))
        const submitted = submitRecipe(outerRecipe(['scalar']), {
            imageOutputDescription: resolved({
                bands: [band('scalar', 'mode', {arrayDimensions: 0})]
            }),
            fallbackPyramidingPolicy
        })

        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(imageOf(submitted).pyramidingPolicy).toEqual({scalar: 'mode'})
    })

    it.each(['DRIVE', 'SEPAL'])('does not consult or send fallback policy for %s', destination => {
        const fallbackPyramidingPolicy = vi.fn(() => ({scalar: 'mean'}))
        const submitted = submitRecipe(outerRecipe(['scalar'], destination), {
            imageOutputDescription: mixedOutput(),
            fallbackPyramidingPolicy
        })

        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(imageOf(submitted)).not.toHaveProperty('pyramidingPolicy')
    })

    it('does not fill a policy when scalar dimensionality is unknown', () => {
        const fallbackPyramidingPolicy = vi.fn(() => ({unknown: 'mean'}))

        expect(() => submitRecipe(outerRecipe(['unknown']), {
            imageOutputDescription: resolved({bands: [{name: 'unknown'}]}),
            fallbackPyramidingPolicy
        })).toThrow(/dimension|band/i)
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(state.submitted).toEqual([])
    })
})

describe('submitRetrieveRecipeTask without a resolved image output', () => {
    it('rejects migration fallback authority without a resolved description', () => {
        expect(() => submit({id: 'SYNTHETIC'}, {
            fallbackPyramidingPolicy: {'.default': 'mean'}
        })).toThrow(/fallback|policy|description/i)
        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])
    })

    it('still derives a legacy function policy from the selected bands', () => {
        const submitted = submit({id: 'SYNTHETIC'}, {
            pyramidingPolicy: bands => Object.fromEntries(bands.map(name => [name, 'mean']))
        })

        expect(imageOf(submitted).pyramidingPolicy).toEqual({'band-1': 'mean'})
    })

    it('still passes a legacy object policy through unchanged', () => {
        const submitted = submit({id: 'SYNTHETIC'}, {pyramidingPolicy: {'.default': 'sample'}})

        expect(imageOf(submitted).pyramidingPolicy).toEqual({'.default': 'sample'})
    })

    it('still omits the policy entirely when neither source is configured', () => {
        const submitted = submit({id: 'SYNTHETIC'})

        expect(submitted).toHaveLength(1)
        expect(imageOf(submitted)).not.toHaveProperty('pyramidingPolicy')
    })
})

// Explicit Retrieve options. The observed path submits the options a command was given rather than whatever the
// recipe happens to hold, so one value must control every task field - a stale stored value must not leak into
// any of them.
describe('submitRetrieveRecipeTask with explicit retrieveOptions', () => {
    const staleRecipe = () => ({
        id: 'recipe-1',
        projectId: 'project-1',
        type: 'SYNTHETIC',
        title: 'A synthetic recipe',
        model: {},
        ui: {retrieveOptions: {destination: 'SEPAL', bands: ['stale'], scale: 999, assetId: 'stale/id'}}
    })

    const explicit = {destination: 'GEE', bands: ['a', 'b'], scale: 30, assetId: 'users/me/out'}

    const submitExplicit = (config = {}) =>
        submitRecipe(staleRecipe(), {retrieveOptions: explicit, ...config})

    it('controls the destination and operation', () => {
        const [task] = submitExplicit()
        expect(task.operation).toBe('image.GEE')
        expect(imageOf([task]).destination).toBe('GEE')
    })

    it('controls the selected bands', () => {
        const submitted = submitExplicit()
        expect(imageOf(submitted).bands).toEqual({selection: ['a', 'b']})
    })

    it('controls the options spread into the submitted image', () => {
        const submitted = submitExplicit()
        expect(imageOf(submitted).scale).toBe(30)
        expect(imageOf(submitted).assetId).toBe('users/me/out')
        expect(JSON.stringify(imageOf(submitted))).not.toContain('stale')
    })

    it('controls the task info', () => {
        const [task] = submitExplicit()
        expect(task.params.taskInfo).toEqual({retrieveOptions: explicit})
    })

    it('still derives policies from the description using the explicit selection', () => {
        const submitted = submitExplicit({
            imageOutputDescription: {
                executionReference: {type: 'RECIPE_REF', id: 'recipe-1'},
                output: {kind: 'IMAGE', bands: [
                    {name: 'a', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'},
                    {name: 'b', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mode'},
                    {name: 'stale', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
                ]},
                evidence: []
            }
        })
        expect(imageOf(submitted).pyramidingPolicy).toEqual({a: 'sample', b: 'mode'})
    })
})
