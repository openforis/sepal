import {describe, expect, it, vi} from 'vitest'

import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The synchronous read, over graphs the real builder produces and the real shared declarations: Optical Mosaic
// describes from its model, Masking preserves its primary input, CCDC observes what it can be asked for, and a
// Sampling Design produces no image. Only the GUI registry is replaced, by the entries each type registers: map
// products and band presentation.
//
// Statuses, authorities and codes are literals, so a production rename cannot pass unnoticed.

vi.mock('~/translate', () => ({msg: key => key}))

vi.mock('../recipeTypeRegistry', async () => {
    const {bandPresentation: ccdcPresentation, mapProducts: ccdcProducts} = await import('./ccdc/bands')
    return {getRecipeType: type => ({
        MOSAIC: {
            bandPresentation: () => ({
                blue: {dataType: {precision: 'int', min: -10000, max: 10000}, tooltip: 'Blue'}
            })
        },
        CCDC: {mapProducts: ccdcProducts, bandPresentation: ccdcPresentation}
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

// Read as an image, a recipe with no image output is refused as one, directly or through a wrapper, and no record
// still to be loaded would change that.
describe('a recipe with no image output', () => {
    it('is invalid, and cannot be previewed', () => {
        const recipe = design()

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'INVALID', authority: null, bands: [], acquisition: null})
        expect(read.diagnostics).toEqual([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['design-1']}])
        expect(canPreview(read)).toBe(false)
    })

    it('makes a wrapper over it invalid, located at the recipe that has none', () => {
        const recipe = masking({primary: 'design-1'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, design()])})

        expect(read.status).toBe('INVALID')
        expect(read.diagnostics).toEqual([{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['masked-1', 'design-1']}])
    })

    it('makes a wrapper over it invalid at once, acquiring nothing for a dependency not held', () => {
        const recipe = masking({primary: 'design-1', mask: 'unloaded'})

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe, design()])})

        expect(read).toMatchObject({status: 'INVALID', acquisition: null})
    })
})

describe('a map product', () => {
    it('is named from the layer config, and an unknown value is no product at all', () => {
        expect(layerProduct(ccdc(), {visualizationType: 'COUNT'})).toEqual({name: 'COUNT'})
        expect(layerProduct(ccdc(), {visualizationType: 'SEGMENTS'})).toBeNull()
        expect(layerProduct(design(), {visualizationType: 'anything'})).toEqual({name: 'IMAGE_OUTPUT'})
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

    it('is described from its declaration, as the product it is, with its presentation', () => {
        const recipe = ccdc()

        const read = readRecipeOutput({recipe, product: COUNT, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'READY', authority: 'DESCRIBED', bands: [{name: 'count', dataType: {arrayDimensions: 0}}]})
        expect(read.description.output.product).toEqual({name: 'COUNT'})
        expect(displayTypes(read)).toEqual({count: {precision: 'int'}})
    })

    it('needs only its dependencies completed when one is not held, never the canonical output described', () => {
        const recipe = ccdc({aoi: {type: 'RECIPE', id: 'aoi-1'}})

        const read = readRecipeOutput({recipe, product: COUNT, graph: graphOf([recipe])})

        expect(read).toMatchObject({
            status: 'READY',
            authority: 'DESCRIBED',
            bands: [{name: 'count', dataType: {arrayDimensions: 0}}],
            acquisition: {kind: 'DEPENDENCIES'}
        })
    })

    // Its declaration is the answer: what it refuses is invalid.
    it('refuses parameters it does not take', () => {
        const recipe = ccdc()

        const read = readRecipeOutput({recipe, product: {name: 'COUNT', parameters: {year: 2020}}, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'INVALID', authority: null, bands: [], acquisition: null})
        expect(read.diagnostics).toEqual([expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS'})])
    })

    it('refuses a product the type does not declare', () => {
        const recipe = ccdc()

        const read = readRecipeOutput({recipe, product: {name: 'SEGMENTS'}, graph: graphOf([recipe])})

        expect(read).toMatchObject({status: 'INVALID', authority: null, bands: []})
        expect(read.diagnostics).toEqual([expect.objectContaining({code: 'UNDECLARED_PRODUCT', product: 'SEGMENTS'})])
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

    it('stays invalid when what it found was a source with no image output', () => {
        const recipe = masking({primary: 'unloaded'})
        const nonImage = {status: 'INVALID', description: null, error: null, dependencyValidity: SOUND,
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['masked-1', 'unloaded']}]}

        const read = readRecipeOutput({recipe, product: OUTPUT, graph: graphOf([recipe]), heldFor: () => nonImage})

        expect(read).toMatchObject({status: 'INVALID', authority: null, bands: [], dependencyValidity: SOUND})
        expect(read.diagnostics).toEqual(nonImage.diagnostics)
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
        const basis = [recipe, mosaic(), design()].map(record => ({id: record.id, content: recipeContent(record)}))

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

const design = () => ({id: 'design-1', type: 'SAMPLING_DESIGN', model: {}})

const ccdc = (model = {}) => ({id: 'ccdc-1', type: 'CCDC', model})

const graphOf = ([rootRecipe, ...others]) => buildRecipeDependencyGraph({
    rootRecipe,
    recipesById: new Map([rootRecipe, ...others].map(recipe => [recipe.id, recipe]))
})
