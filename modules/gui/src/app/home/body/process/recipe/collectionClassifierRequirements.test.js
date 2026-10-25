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

    // A Time Series or CCDC trains the Classification it selects whatever it asks of it (type/timeSeries.js, ccdc.js),
    // so the one selected here stores points.
    it.each([
        ['selecting no classification', undefined, () => [classificationOver(['VV_mean'])]],
        ['selecting one the images can feed', CLASSIFICATION, () => [classifiedBy({type: 'RANDOM_FOREST'}), MOSAIC]]
    ])('marks nothing %s', (_case, classification, records) => {
        const recipe = recipeOf(type, {classification})
        const state = stateOf(recipe, ...records())

        expect(sourceProblemsOfState(state, ID, undefined, Date.now(), NOTHING_HELD)).toEqual({})
    })
})

// CCDC's breakpoint bands and Phenology's band choose what the Classification computes: one its classifier's
// configuration does not provide is said there, and holds back previews and Retrieve; the class alone, or a band of the
// images themselves, holds nothing; a Classification still being read is never refused.
describe.each([
    ['CCDC', 'breakpointBands', bands => bands],
    ['PHENOLOGY', 'band', ([band]) => band]
])('a %s choosing classified outputs at its %s', (type, field, valueOf) => {
    it.each([
        ['an SVM classifying C_SVC', {type: 'SVM', svmType: 'C_SVC'}, ['regression']],
        ['an SVM of one class', {type: 'SVM', svmType: 'ONE_CLASS'}, ['probability_1']]
    ])('marks the field where %s does not provide what it chooses, holding back previews and Retrieve', (_case, classifier, chosen) => {
        const recipe = recipeOf(type, {classification: CLASSIFICATION, [field]: valueOf(chosen)})
        const state = stateOf(recipe, classifiedBy(classifier), MOSAIC)

        expect(sourceProblemsOfState(state, ID, undefined, Date.now(), NOTHING_HELD))
            .toEqual({sources: `process.source.classifiedOutputs.${field}`})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})).toMatchObject({withdraw: true})
        expect(retrieveAvailability({state, recipe, heldFor: NOTHING_HELD}).available).toBe(false)
    })

    it.each([
        ['a regression a classifier able to regress provides', {type: 'RANDOM_FOREST'}, ['regression']],
        ['class probabilities an SVM classifying NU_SVC provides', {type: 'SVM', svmType: 'NU_SVC'}, ['probability_1']],
        ['a band of the images themselves', {type: 'SVM', svmType: 'ONE_CLASS'}, ['ndvi']]
    ])('marks nothing for %s', (_case, classifier, chosen) => {
        const recipe = recipeOf(type, {classification: CLASSIFICATION, [field]: valueOf(chosen)})

        expect(sourceProblemsOfState(stateOf(recipe, classifiedBy(classifier), MOSAIC), ID, undefined, Date.now(), NOTHING_HELD)).toEqual({})
    })

    it('refuses nothing, marking nothing, while its classification is still to be read', () => {
        const recipe = recipeOf(type, {classification: CLASSIFICATION, [field]: valueOf(['regression'])})
        const state = stateOf(recipe)

        expect(sourceProblemsOfState(state, ID, undefined, Date.now(), NOTHING_HELD)).toEqual({})
        expect(requestGate({state, recipe, operation: 'IMAGE_OUTPUT', heldFor: NOTHING_HELD})?.withdraw ?? false).toBe(false)
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

// A Landsat mosaic, described from its configuration, so a Classification over it needs no observation.
const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

// A Classification of two classes over optical bands the Landsat scenes and its mosaic supply, by the classifier given,
// trainable: a classified band trains it, so it stores points.
const classifiedBy = classifier => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC.id, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
        classifier
    }
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
