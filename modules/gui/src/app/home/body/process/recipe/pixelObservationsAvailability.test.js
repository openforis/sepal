import {describe, expect, it, vi} from 'vitest'

// Whether a Time Series' or a CCDC's pixel chart may read observations, through their real registrations and the
// shared readiness of PIXEL_OBSERVATIONS: the Classification their Sources select must be one the collection's images
// can feed, judged at whatever pixel is chosen, so the AOI is no concern of it. What the session does not hold is
// waited for, under a key naming the operation, and an answer the runtime holds for another question never stands in.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/apiRegistry', () => ({default: {}}))

const {addRecipeType, getRecipeType} = await import('../recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {pixelOperationsAvailability} = await import('./operationAvailability')
const {readOperationReadiness} = await import('./operationReadiness')

addRecipeType(ccdc())
addRecipeType(timeSeries())

describe.each(['CCDC', 'TIME_SERIES'])('a %s\'s pixel observations', type => {
    it('are not available where its classification\'s classifier the images cannot feed, said in Sources', () => {
        const recipe = recipeOf(type)

        const {available, gate} = assess(recipe, classificationOver(['VV_mean', 'VH_med']))

        expect(available).toBe(false)
        expect(gate).toMatchObject({withdraw: true, wait: false, code: 'CONFIGURATION_UNMET', section: sourcesSectionOf(type)})
    })

    it('are available again once the classification is one the images can feed, nothing left to read', () => {
        const recipe = recipeOf(type)

        const {available} = assess(recipe, classificationOver(['red', 'nir', 'ndvi']))

        expect(available).toBe(true)
        expect(read(recipe, classificationOver(['red', 'nir', 'ndvi'])).acquisition).toBe(null)
    })

    it.each([
        ['a recipe the session does not hold', {type: 'RECIPE', id: 'aoi-recipe'}],
        ['the recipe itself', {type: 'RECIPE', id: ID}],
        ['an incomplete reference', {type: 'RECIPE'}]
    ])('are available over an AOI of %s, which they do not read', (_case, aoi) => {
        const recipe = recipeOf(type, {aoi})

        expect(assess(recipe, classificationOver(['red', 'nir', 'ndvi'])).available).toBe(true)
    })

    it('wait, finding nothing, while the session does not hold the classification, naming the operation to read it for', () => {
        const recipe = recipeOf(type)

        const {available, gate} = assess(recipe)

        expect(available).toBe(false)
        expect(gate).toMatchObject({wait: true, withdraw: false, code: 'SOURCE_PENDING'})
        expect(read(recipe).acquisition.key).toMatchObject({kind: 'READINESS', operation: 'PIXEL_OBSERVATIONS'})
    })

    it('are judged by what the runtime settles for them once it has read the classification', () => {
        const recipe = recipeOf(type)
        const settled = readiness => key => isObservationsKey(key) ? {status: 'COMPLETE', readiness, dependencyValidity: SOUND} : null

        expect(assess(recipe, undefined, settled(NOT_RUNNABLE)).gate).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET'})
        expect(assess(recipe, undefined, settled(RUNNABLE)).available).toBe(true)
    })

    it('are unavailable, finding nothing, where the runtime could not read the classification', () => {
        const recipe = recipeOf(type)
        const failed = key => isObservationsKey(key) ? {status: 'UNAVAILABLE', error: new Error('recipe not found'), dependencyValidity: null} : null

        expect(assess(recipe, undefined, failed).gate).toMatchObject({withdraw: false, wait: false, code: 'SOURCE_UNAVAILABLE'})
    })

    it('are never answered by what the runtime holds for the recipe\'s image output', () => {
        const recipe = recipeOf(type)
        const imageOutput = ({kind}) => kind === 'DESCRIBE' ? {status: 'READY', readiness: RUNNABLE, dependencyValidity: SOUND} : null

        expect(assess(recipe, undefined, imageOutput).gate).toMatchObject({wait: true})
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const SOUND = {status: 'VALID', diagnostics: []}
const RUNNABLE = {status: 'READY', findings: [], needs: {records: [], observations: []}}
const NOT_RUNNABLE = {
    status: 'NOT_READY',
    findings: [{code: 'UNSUPPLIED_CLASSIFIER_INPUTS', path: ['model', 'sources', 'classification'], recipePath: [ID]}],
    needs: {records: [], observations: []}
}

const recipeOf = (type, {aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}} = {}) => ({
    id: ID,
    type,
    title: 'Recipe',
    model: {
        aoi,
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    }
})

// A Classification over an asset, its classifier reading the features given.
const classificationOver = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
})

const isObservationsKey = ({kind, operation}) => kind === 'READINESS' && operation === 'PIXEL_OBSERVATIONS'

const loadedRecipesOf = (recipe, classification) =>
    Object.fromEntries([recipe, classification].filter(Boolean).map(record => [record.id, record]))

const assess = (recipe, classification, heldFor = () => null) =>
    pixelOperationsAvailability({state: {process: {loadedRecipes: loadedRecipesOf(recipe, classification)}}, recipe, heldFor, operations: ['PIXEL_OBSERVATIONS']})

const read = (recipe, classification) =>
    readOperationReadiness({recipe, operation: 'PIXEL_OBSERVATIONS', loadedRecipes: loadedRecipesOf(recipe, classification)})

// Where the type says what its classifier inputs need, as its Sources toolbar button does.
const sourcesSectionOf = type => getRecipeType(type).sourceRequirements
    .find(({id}) => id === 'sources.classification.classifierInputs').section.label
