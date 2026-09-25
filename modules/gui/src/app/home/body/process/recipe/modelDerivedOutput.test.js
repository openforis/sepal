import {beforeEach, describe, expect, it, vi} from 'vitest'

// Regression, Unsupervised Classification, Index Change and Class Change through their real registrations, shared declarations, the
// common read and the generic Retrieve submission. Only the task API and notifications are replaced.

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

const submitted = vi.hoisted(() => [])
vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                submitted.push(task)
                return {subscribe: () => {}}
            }
        }
    }
}))

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: regression} = await import('./regression/regression')
const {default: unsupervisedClassification} = await import('./unsupervisedClassification/unsupervisedClassification')
const {default: indexChange} = await import('./indexChange/indexChange')
const {default: classChange} = await import('./classChange/classChange')
const {retrieveTask: regressionTask} = await import('./regression/regressionRecipe')
const {retrieveTask: clusteringTask} = await import('./unsupervisedClassification/unsupervisedClassificationRecipe')
const {retrieveTask: indexChangeTask} = await import('./indexChange/indexChangeRecipe')
const {retrieveTask: classChangeTask} = await import('./classChange/classChangeRecipe')
const {canPreview, displayTypes} = await import('./recipeOutput')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')
const {recipeVisualizations} = await import('./visualizations')

addRecipeType(regression())
addRecipeType(unsupervisedClassification())
addRecipeType(indexChange())
addRecipeType(classChange())

beforeEach(() => {
    submitted.length = 0
})

describe('a regression', () => {
    it('is described from its declaration while the recipe it trains on is not even loaded', () => {
        const {output} = read(regressionOf({trainingRecipe: 'training-1'}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands).toEqual([expect.objectContaining({name: 'regression', dataType: {arrayDimensions: 0}})])
    })

    it('is presented with its label, float cursor precision and preset style', () => {
        const recipe = regressionOf()
        const {output} = read(recipe)

        expect(output.presentation.regression.label).toBe('process.regression.bands.regression')
        expect(displayTypes(output)).toEqual({regression: {precision: 'float'}})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands)).toEqual([['regression']])
    })

    it('exports its band to Earth Engine averaged into coarser pyramid levels', () => {
        retrieve(read(regressionOf()), 'GEE', regressionTask)

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['regression']}, {regression: 'mean'}]])
    })
})

describe('an unsupervised classification', () => {
    it('is described from its declaration while the imagery it clusters is not even loaded', () => {
        const {output} = read(clusteringOf({images: [{type: 'RECIPE_REF', id: 'mosaic-1'}]}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands).toEqual([expect.objectContaining({name: 'class', dataType: {arrayDimensions: 0}})])
    })

    it('is presented with its label, the cluster range as cursor precision, and its preset style', () => {
        const recipe = clusteringOf({numberOfClusters: 7})
        const {output} = read(recipe)

        expect(output.presentation.class.label).toBe('process.unsupervisedClassification.bands.class')
        expect(displayTypes(output)).toEqual({class: {precision: 'int', min: 0, max: 6}})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands)).toEqual([['class']])
    })

    it('exports its band to Earth Engine keeping the most common cluster in coarser pyramid levels', () => {
        retrieve(read(clusteringOf()), 'GEE', clusteringTask)

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['class']}, {class: 'mode'}]])
    })
})

describe('an index change', () => {
    // In the order execution builds them: the continuous comparisons, the error and confidence derived from both
    // images' error bands, then the legend's classification of the difference.
    it.each([
        ['a legend and no error bands', {}, ['difference', 'normalized_difference', 'ratio', 'change']],
        ['error bands on both images', {errorBands: true}, ['difference', 'normalized_difference', 'ratio', 'error', 'confidence', 'change']],
        ['an error band on one image only', {errorBands: 'from'}, ['difference', 'normalized_difference', 'ratio', 'change']],
        ['an empty legend', {entries: []}, ['difference', 'normalized_difference', 'ratio']]
    ])('with %s is described with the bands execution builds, reading neither image', (_case, configuration, names) => {
        const {output} = read(indexChangeOf({images: RECIPE_IMAGES, ...configuration}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(names)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is presented with the legend\'s range on its change band, and the preset styles of the bands it has', () => {
        const recipe = indexChangeOf({errorBands: true})
        const {output} = read(recipe)

        expect(displayTypes(output).change).toEqual({precision: 'int', min: 1, max: 3})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands[0]))
            .toEqual(['difference', 'normalized_difference', 'ratio', 'change', 'error', 'confidence'])
    })

    it('offers no change style without a legend', () => {
        const recipe = indexChangeOf({entries: []})

        expect(recipeVisualizations(recipe, read(recipe).output.availableBands).map(({bands}) => bands[0]))
            .toEqual(['difference', 'normalized_difference', 'ratio'])
    })

    it('exports the bands selected, in the order selected, keeping the most common change class', () => {
        retrieve(read(indexChangeOf()), 'GEE', indexChangeTask, {bands: ['change', 'difference']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['change', 'difference']}, {change: 'mode', difference: 'mean'}]])
    })

    // No Index Change panel asks for all bands; a request that does takes them in the order execution builds.
    it('exports all its bands in the order execution builds them', () => {
        retrieve(read(indexChangeOf({errorBands: true})), 'GEE', indexChangeTask)

        expect(submitted[0].params.image.bands.selection)
            .toEqual(['difference', 'normalized_difference', 'ratio', 'error', 'confidence', 'change'])
        expect(submitted[0].params.image.pyramidingPolicy).toEqual({
            difference: 'mean', normalized_difference: 'mean', ratio: 'mean', error: 'mean', confidence: 'mean', change: 'mode'
        })
    })

    it('names a saved band its configuration no longer provides, and exports nothing', () => {
        const answer = read(indexChangeOf())
        const bands = ['difference', 'error']

        retrieve(answer, 'GEE', indexChangeTask, {bands})

        expect(retrieveDecision({...answer, names: bands, destination: 'GEE', task: indexChangeTask}))
            .toMatchObject({status: 'BLOCKED', reason: 'MISSING_SELECTION', missingBandNames: ['error']})
        expect(submitted).toEqual([])
    })
})

describe('a class change', () => {
    // Confidence is measured from both images' probability bands, and masked where either has none; the band is
    // there either way, whatever the snapshots saved when the images were selected say.
    it('is described with its transition and confidence, though neither saved snapshot holds a probability band', () => {
        const {output} = read(classChangeOf({images: RECIPE_IMAGES}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name, dataType}) => [name, dataType.arrayDimensions]))
            .toEqual([['transition', 0], ['confidence', 0]])
    })

    it('is presented with the range of its transitions, and the preset styles of both bands', () => {
        const recipe = classChangeOf()
        const {output} = read(recipe)

        expect(displayTypes(output)).toEqual({
            transition: {precision: 'int', min: 1, max: 4},
            confidence: {precision: 'int', min: 0, max: 100}
        })
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands[0]))
            .toEqual(['transition', 'confidence'])
    })

    it('exports its transitions keeping the most common one, and its confidence averaged', () => {
        retrieve(read(classChangeOf()), 'GEE', classChangeTask, {bands: ['transition', 'confidence']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['transition', 'confidence']}, {transition: 'mode', confidence: 'mean'}]])
    })
})

describe.each([
    ['a regression', recipe => regressionOf({trainingRecipe: recipe}), regressionTask],
    ['an unsupervised classification', recipe => clusteringOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}]}), clusteringTask],
    ['an index change', recipe => indexChangeOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}, ASSET_IMAGE]}), indexChangeTask],
    ['a class change', recipe => classChangeOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}, ASSET_IMAGE]}), classChangeTask]
])('%s', (_type, withSource, task) => {
    it('exports to Drive with no pyramiding policy', () => {
        retrieve(read(withSource(undefined)), 'DRIVE', task)

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image).not.toHaveProperty('pyramidingPolicy')
    })

    // Reading itself as its own source: its bands are still known, and none of them may be run.
    it('is neither previewed nor exported over dependencies known to be broken', () => {
        const recipe = withSource(ID)
        const answer = read(recipe)

        retrieve(answer, 'GEE', task)

        expect(answer.output.bands).not.toHaveLength(0)
        expect(answer.output.dependencyValidity.status).toBe('INVALID')
        expect(canPreview(answer.output)).toBe(false)
        expect(submitted).toEqual([])
    })
})

const ID = 'model-1'

const regressionOf = ({trainingRecipe} = {}) => ({
    id: ID,
    type: 'REGRESSION',
    title: 'Biomass',
    model: {
        inputImagery: {images: [{imageId: 'image-1', type: 'ASSET', id: 'users/x/covariates'}]},
        trainingData: {dataSets: trainingRecipe
            ? [{type: 'RECIPE', recipe: trainingRecipe}]
            : [{type: 'EE_TABLE', referenceData: []}]}
    }
})

const clusteringOf = ({images = [{imageId: 'image-1', type: 'ASSET', id: 'users/x/covariates'}], numberOfClusters = 5} = {}) => ({
    id: ID,
    type: 'UNSUPERVISED_CLASSIFICATION',
    title: 'Clusters',
    model: {
        inputImagery: {images},
        clusterer: {type: 'KMEANS', numberOfClusters}
    }
})

const ASSET_IMAGE = {type: 'ASSET', id: 'users/x/ndvi'}
const RECIPE_IMAGES = [{type: 'RECIPE_REF', id: 'before-1'}, {type: 'RECIPE_REF', id: 'after-1'}]

const legendEntry = (value, operator) => ({
    value,
    label: `class ${value}`,
    color: '#000000',
    booleanOperator: 'and',
    constraints: [{image: 'this-recipe', band: 'difference', operator, value: 0}]
})

const indexChangeOf = ({images: [from, to] = [ASSET_IMAGE, ASSET_IMAGE], errorBands, entries} = {}) => ({
    id: ID,
    type: 'INDEX_CHANGE',
    title: 'Greening',
    model: {
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        fromImage: {...from, band: 'ndvi', ...(errorBands && {errorBand: 'ndvi_error'})},
        toImage: {...to, band: 'ndvi', ...(errorBands === true && {errorBand: 'ndvi_error'})},
        legend: {entries: entries || [legendEntry(1, '<'), legendEntry(2, '='), legendEntry(3, '>')]},
        options: {minConfidence: 2.5}
    }
})

const CLASSES = [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]

// A snapshot as the input panel saves it: each band with the class values its categorical style names.
const classImage = (image, band) => ({...image, band, bands: {[band]: {values: [1, 2]}}, legendEntries: CLASSES})

const classChangeOf = ({images: [from, to] = [ASSET_IMAGE, ASSET_IMAGE]} = {}) => ({
    id: ID,
    type: 'CLASS_CHANGE',
    title: 'Deforestation',
    model: {
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        fromImage: classImage(from, 'class'),
        toImage: classImage(to, 'landcover'),
        legend: {entries: [1, 2, 3, 4].map(value => ({value, label: `transition ${value}`, color: '#000000'}))},
        options: {minConfidence: 0}
    }
})

// The read a Retrieve panel makes, with nothing but the recipe itself loaded and nothing retained.
const read = recipe => readRetrieveOutput({
    state: {process: {loadedRecipes: {[recipe.id]: recipe}}},
    recipeId: recipe.id,
    heldFor: () => null
})

const retrieve = ({recipe, output, pending}, destination, task, selection = {useAllBands: true}) => submitRetrieve({
    recipe,
    output,
    pending,
    request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination, ...selection}}),
    task
})
