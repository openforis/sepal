import {beforeEach, describe, expect, it, vi} from 'vitest'

// Regression and Unsupervised Classification through their real registrations, shared declarations, the common read
// and the generic Retrieve submission. Only the task API and notifications are replaced.

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
const {retrieveTask: regressionTask} = await import('./regression/regressionRecipe')
const {retrieveTask: clusteringTask} = await import('./unsupervisedClassification/unsupervisedClassificationRecipe')
const {canPreview, displayTypes} = await import('./recipeOutput')
const {physicalRequest, readRetrieveOutput, submitRetrieve} = await import('./retrieveOutput')
const {recipeVisualizations} = await import('./visualizations')

addRecipeType(regression())
addRecipeType(unsupervisedClassification())

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

describe.each([
    ['a regression', recipe => regressionOf({trainingRecipe: recipe}), regressionTask],
    ['an unsupervised classification', recipe => clusteringOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}]}), clusteringTask]
])('%s', (_type, withSource, task) => {
    it('exports to Drive with no pyramiding policy', () => {
        retrieve(read(withSource(undefined)), 'DRIVE', task)

        expect(submitted).toHaveLength(1)
        expect(submitted[0].params.image).not.toHaveProperty('pyramidingPolicy')
    })

    // Reading itself as its own source: its band is still known, and none of it may be run.
    it('is neither previewed nor exported over dependencies known to be broken', () => {
        const recipe = withSource(ID)
        const answer = read(recipe)

        retrieve(answer, 'GEE', task)

        expect(answer.output.bands.map(({name}) => name)).toHaveLength(1)
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

// The read a Retrieve panel makes, with nothing but the recipe itself loaded and nothing retained.
const read = recipe => readRetrieveOutput({
    state: {process: {loadedRecipes: {[recipe.id]: recipe}}},
    recipeId: recipe.id,
    heldFor: () => null
})

const retrieve = ({recipe, output, pending}, destination, task) => submitRetrieve({
    recipe,
    output,
    pending,
    request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination, useAllBands: true}}),
    task
})
