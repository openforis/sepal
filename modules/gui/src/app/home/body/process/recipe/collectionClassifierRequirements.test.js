import {describe, expect, it, vi} from 'vitest'

// CCDC, Time Series and Phenology through their real registrations and the shared reads: a selected Classification whose
// classifier the configured collection's images cannot feed marks SRC, naming the setting to change, and holds back
// previews and Retrieve; selecting none, or one the images can feed, holds nothing.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/apiRegistry', () => ({default: {}}))

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {default: phenology} = await import('./phenology/phenology')
const {requestGate} = await import('./sourceRequirements')
const {sourceProblemsOfState} = await import('./selectedSourceStatus')
const {retrieveAvailability} = await import('./operationAvailability')

addRecipeType(ccdc())
addRecipeType(timeSeries())
addRecipeType(phenology())

describe.each(['CCDC', 'TIME_SERIES', 'PHENOLOGY'])('a %s', type => {
    it.each([
        ['classification', ['VV_mean', 'VH_med']],
        ['dataSets', ['VV', 'VH']]
    ])('marks SRC at its %s where its classification\'s classifier the images cannot feed, holding back previews and Retrieve', (field, included) => {
        const recipe = recipeOf(type, {classification: CLASSIFICATION})
        const state = stateOf(recipe, classificationOver(included))

        expect(sourceProblemsOfState(state, ID, undefined, Date.now(), NOTHING_HELD))
            .toEqual({sources: `process.source.classifierInputs.${field}`})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toMatchObject({withdraw: true})
        expect(retrieveAvailability({state, recipe, heldFor: NOTHING_HELD}).available).toBe(false)
    })

    it.each([
        ['selecting no classification', undefined, ['VV_mean']],
        ['selecting one the images can feed', CLASSIFICATION, ['red', 'nir', 'ndvi']]
    ])('marks nothing %s', (_case, classification, included) => {
        const recipe = recipeOf(type, {classification})
        const state = stateOf(recipe, classificationOver(included))

        expect(sourceProblemsOfState(state, ID, undefined, Date.now(), NOTHING_HELD)).toEqual({})
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const NOTHING_HELD = () => null

const recipeOf = (type, sources) => ({
    id: ID,
    type,
    title: 'Recipe',
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01', fromYear: 2020, toYear: 2020},
        sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, band: 'ndvi', breakpointBands: ['ndvi'], ...sources},
        options: {corrections: ['SR']}
    }
})

// A Classification over an asset, its classifier reading the features given.
const classificationOver = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
})

const stateOf = (...records) => ({
    process: {
        loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
        recipes: records.map(({id}) => ({id, revision: 1})),
        recipeListing: {checkedAt: Date.now()},
        saveStates: {},
        tabs: []
    }
})
