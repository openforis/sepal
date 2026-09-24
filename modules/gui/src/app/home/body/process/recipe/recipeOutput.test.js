import {describe, expect, it, vi} from 'vitest'

import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The synchronous read, over graphs the real builder produces and the real shared declarations: Optical Mosaic
// describes from its model, Masking preserves its primary input, CCDC observes what it can be asked for, and
// Regression declares nothing. Only the GUI registry is replaced, by the entries each type registers: legacy
// helpers, map products and band presentation.
//
// Statuses, authorities and codes are literals, so a production rename cannot pass unnoticed.

const registered = vi.hoisted(() => ({maskingEvidence: 'OBSERVED'}))

vi.mock('~/translate', () => ({msg: key => key}))

vi.mock('../recipeTypeRegistry', async () => {
    const {mapProducts: ccdcProducts} = await import('./ccdc/bands')
    return {getRecipeType: type => ({
        MOSAIC: {
            bandPresentation: () => ({
                blue: {dataType: {precision: 'int', min: -10000, max: 10000}, tooltip: 'Blue'}
            })
        },
        REGRESSION: {
            getAvailableBands: () => ({regression: {dataType: {precision: 'float'}, label: 'Regression'}})
        },
        MASKING: {
            getAvailableBands: () => registered.maskingEvidence === 'UNAVAILABLE'
                ? null
                : {regression: {dataType: {arrayDimensions: 0}}}
        },
        CCDC: {mapProducts: ccdcProducts}
    })[type]}
})

const {canPreview, compatibleBasis, displayTypes, layerProduct, productArgs, readRecipeOutput} = await import('./recipeOutput')
const {recipeContent} = await import('./recipeContent')

describe('an answer from the session alone', () => {
    it('describes an optical mosaic from its model, with physical bands and display precision kept apart', () => {
        const recipe = mosaic()

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'READY', authority: 'DESCRIBED', acquisition: null})
        expect(read.bands).toContainEqual(expect.objectContaining({name: 'blue', dataType: {arrayDimensions: 0}}))
        expect(read.availableBands.blue).toEqual(expect.objectContaining({
            dataType: {arrayDimensions: 0},
            tooltip: 'Blue',
            display: {precision: 'int', min: -10000, max: 10000}
        }))
        expect(displayTypes(read).blue).toEqual({precision: 'int', min: -10000, max: 10000})
        expect(read.dependencyValidity).toEqual({status: 'VALID', diagnostics: []})
        expect(canPreview(read)).toBe(true)
    })

    it('describes masking over an optical mosaic the session holds, with nothing retained', () => {
        const recipe = masking({primary: 'mosaic-1'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, mosaic()])})

        expect(read).toMatchObject({status: 'READY', authority: 'DESCRIBED', acquisition: null})
        expect(read.bands.map(({name}) => name)).toContain('blue')
    })

    it('answers a declared output it reads while an unread dependency is not held, but cannot yet preview it', () => {
        const recipe = masking({primary: 'mosaic-1', mask: 'unloaded'})
        const graph = graphOf([recipe, mosaic()])

        const read = readRecipeOutput({recipe, product: OUTPUT, graph})

        expect(read).toMatchObject({status: 'READY', dependencyValidity: null, acquisition: {kind: 'DESCRIBE'}})
        expect(canPreview(read)).toBe(false)
    })

    it('needs evidence for a dependency it reads that the session does not hold, which is not a deletion', () => {
        const recipe = masking({primary: 'unloaded'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'NEEDS_EVIDENCE', bands: [], acquisition: {kind: 'DESCRIBE'}})
        expect(read.error).toBeNull()
    })

    it('needs evidence for an output only observation describes', () => {
        const recipe = masking({primary: 'ccdc-1'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, ccdc()])})

        expect(read).toMatchObject({status: 'NEEDS_EVIDENCE', acquisition: {kind: 'DESCRIBE'}})
    })
})

describe('a legacy answer', () => {
    it('passes an undeclared type\'s helper through as names, its data type as display only', () => {
        const recipe = regression()

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'READY', authority: 'LEGACY', bands: [{name: 'regression'}], acquisition: null})
        expect(read.availableBands).toEqual({regression: {label: 'Regression', display: {precision: 'float'}}})
    })

    it('answers a declared wrapper over an undeclared source from the wrapper\'s own helper', () => {
        const recipe = masking({primary: 'regression-1'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, regression()])})

        expect(read).toMatchObject({status: 'READY', authority: 'LEGACY'})
        expect(read.availableBands).toEqual({regression: {dataType: {arrayDimensions: 0}}})
    })

    it('is never taken from evidence that could not be had', () => {
        registered.maskingEvidence = 'UNAVAILABLE'
        const recipe = masking({primary: 'regression-1'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, regression()])})
        registered.maskingEvidence = 'OBSERVED'

        expect(read).toMatchObject({status: 'UNAVAILABLE', authority: null, bands: [], acquisition: null})
    })
})

describe('a map product', () => {
    it('is named from the layer config, and an unknown value is no product at all', () => {
        expect(layerProduct(ccdc(), {visualizationType: 'COUNT'})).toEqual({name: 'COUNT'})
        expect(layerProduct(ccdc(), {visualizationType: 'SEGMENTS'})).toBeNull()
        expect(layerProduct(regression(), {visualizationType: 'anything'})).toEqual({name: 'IMAGE_OUTPUT'})
    })

    // A layer whose form has not yet written its defaults shows the same product it will show once it has, and
    // asks Earth Engine for that product in so many words - never for whatever an absent mode builds.
    it('is the type\'s default where the layer config names none, and is sent as such', () => {
        const unwritten = {visParams: {bands: ['count']}}

        expect(layerProduct(ccdc(), unwritten)).toEqual({name: 'COUNT'})
        expect(productArgs(ccdc(), unwritten)).toEqual({visualizationType: 'COUNT'})
    })

    it('refuses an unknown product rather than answering another', () => {
        const recipe = ccdc()

        const read = readRecipeOutput({recipe, product: null, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'INVALID', bands: [], diagnostics: [{code: 'UNKNOWN_PRODUCT'}]})
    })

    it('needs only its dependencies completed when one is not held, never the canonical output described', () => {
        const recipe = ccdc({aoi: {type: 'RECIPE', id: 'aoi-1'}})

        const read = readRecipeOutput({recipe, product: COUNT, graph: graphOf([recipe])})

        expect(read).toMatchObject({
            status: 'READY',
            authority: 'LEGACY',
            bands: [{name: 'count'}],
            acquisition: {kind: 'DEPENDENCIES'}
        })
    })

    it('keeps its bands when a dependency cannot be read, withholding the preview for that reason alone', () => {
        const recipe = ccdc({aoi: {type: 'RECIPE', id: 'aoi-1'}})
        const failure = new Error('recipe not found')
        const unreadable = {status: 'UNAVAILABLE', error: failure, dependencyValidity: {status: 'UNAVAILABLE', diagnostics: []}}

        const read = readRecipeOutput({recipe, product: COUNT, graph: graphOf([recipe]), heldFor: () => unreadable})

        expect(read).toMatchObject({status: 'READY', bands: [{name: 'count'}], error: failure})
        expect(read.dependencyValidity.status).toBe('UNAVAILABLE')
        expect(canPreview(read)).toBe(false)
    })
})

describe('a retained description', () => {
    const unloadedMask = () => {
        const recipe = masking({primary: 'mosaic-1', mask: 'unloaded'})
        return {recipe, graph: graphOf([recipe, mosaic()])}
    }

    it('answers description and validity together once it arrives', () => {
        const {recipe, graph} = unloadedMask()
        const description = {
            executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
            output: {kind: 'IMAGE', bands: [{name: 'blue', dataType: {arrayDimensions: 0}}]},
            evidence: []
        }
        const terminal = {status: 'READY', description, diagnostics: [], error: null, dependencyValidity: SOUND}

        const read = readRecipeOutput({recipe, product: OUTPUT, graph, heldFor: () => terminal})

        expect(read).toMatchObject({status: 'READY', bands: description.output.bands, dependencyValidity: SOUND})
        expect(canPreview(read)).toBe(true)
    })

    it('withdraws the preliminary choices when the closure failed, keeping what it had established', () => {
        const {recipe, graph} = unloadedMask()
        const failure = new Error('recipe not found')
        const failedClosure = {status: 'UNAVAILABLE', description: null, diagnostics: [], error: failure,
            dependencyValidity: {status: 'UNAVAILABLE', diagnostics: [{code: 'MISSING_SOURCE'}]}}

        const read = readRecipeOutput({recipe, product: OUTPUT, graph, heldFor: () => failedClosure})

        expect(read).toMatchObject({status: 'UNAVAILABLE', bands: [], error: failure})
        expect(read.dependencyValidity.status).toBe('UNAVAILABLE')
    })

    it('keeps a sound closure sound when only the observation failed, and still withholds the preview', () => {
        const recipe = masking({primary: 'ccdc-1'})
        const failure = new Error('ajax error')
        const failedObservation = {status: 'UNAVAILABLE', description: null, diagnostics: [], error: failure,
            dependencyValidity: SOUND}

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, ccdc()]), heldFor: () => failedObservation})

        expect(read).toMatchObject({status: 'UNAVAILABLE', dependencyValidity: SOUND})
        expect(canPreview(read)).toBe(false)
    })

    it('becomes a legacy answer when all it found was an output nothing declares', () => {
        const recipe = masking({primary: 'unloaded'})
        const undeclared = {status: 'INVALID', description: null, error: null, dependencyValidity: SOUND,
            diagnostics: [{code: 'UNDECLARED_OUTPUT', path: [], recipePath: ['masked-1', 'unloaded']}]}

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe]), heldFor: () => undeclared})

        expect(read).toMatchObject({status: 'READY', authority: 'LEGACY', dependencyValidity: SOUND})
    })

    it('is asked for by the key of the work it answered', () => {
        const {recipe, graph} = unloadedMask()
        const asked = []

        readRecipeOutput({recipe, product: OUTPUT, graph, heldFor: key => (asked.push(key), null)})

        expect(asked).toEqual([{
            kind: 'DESCRIBE',
            content: graph.recipes.map(({id}) => expect.objectContaining({id}))
        }])
    })
})

describe('whether a retained terminal is about the records held now', () => {
    it('holds while every record it read that the session also holds is unchanged', () => {
        const recipe = masking({primary: 'mosaic-1'})
        const basis = [recipe, mosaic(), regression()].map(record => ({id: record.id, content: recipeContent(record)}))

        expect(compatibleBasis(basis, graphOf([{...recipe, title: 'Renamed', revision: 9}, mosaic()]))).toBe(true)
    })

    it('fails once a record it read has changed in the session', () => {
        const recipe = masking({primary: 'mosaic-1'})
        const basis = [recipe, mosaic()].map(record => ({id: record.id, content: recipeContent(record)}))
        const edited = {...mosaic(), model: {...mosaic().model, compositeOptions: {corrections: ['SR'], compose: 'MEDOID'}}}

        expect(compatibleBasis(basis, graphOf([recipe, edited]))).toBe(false)
    })
})

const OUTPUT = {name: 'IMAGE_OUTPUT'}
const COUNT = {name: 'COUNT'}
const SOUND = {status: 'VALID', diagnostics: []}

const mosaic = () => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
})

const masking = ({primary, mask}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: primary},
        ...(mask && {imageMask: {type: 'RECIPE_REF', id: mask}})
    }
})

const regression = () => ({id: 'regression-1', type: 'REGRESSION', model: {}})

const ccdc = (model = {}) => ({id: 'ccdc-1', type: 'CCDC', model})

const graphOf = ([rootRecipe, ...others]) => buildRecipeDependencyGraph({
    rootRecipe,
    recipesById: new Map([rootRecipe, ...others].map(recipe => [recipe.id, recipe]))
})
