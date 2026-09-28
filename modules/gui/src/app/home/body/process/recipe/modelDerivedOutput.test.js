import {beforeEach, describe, expect, it, vi} from 'vitest'

// Regression, Unsupervised Classification, Index Change, Class Change, Classification, Remapping, Phenology, PyEO
// Alerts and LandTrendr through their real registrations, shared declarations, the common read and the generic Retrieve submission.
// Only the task API and notifications are replaced.

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
const {default: classification} = await import('./classification/classification')
const {default: remapping} = await import('./remapping/remapping')
const {default: phenology} = await import('./phenology/phenology')
const {default: pyeoAlerts} = await import('./pyeoAlerts/pyeoAlerts')
const {default: landTrendr} = await import('./landTrendr/landTrendr')
const {retrieveTask: regressionTask} = await import('./regression/regressionRecipe')
const {retrieveTask: clusteringTask} = await import('./unsupervisedClassification/unsupervisedClassificationRecipe')
const {retrieveTask: indexChangeTask} = await import('./indexChange/indexChangeRecipe')
const {retrieveTask: classChangeTask} = await import('./classChange/classChangeRecipe')
const {retrieveTask: classificationTask} = await import('./classification/classificationRecipe')
const {retrieveTask: remappingTask} = await import('./remapping/remappingRecipe')
const {retrieveTask: phenologyTask} = await import('./phenology/phenologyRecipe')
const {retrieveTask: pyeoAlertsTask} = await import('./pyeoAlerts/pyeoAlertsRecipe')
const {retrieveTask: landTrendrTask} = await import('./landTrendr/landTrendrRecipe')
const {canPreview, displayTypes, layerProduct, readRecipeOutput} = await import('./recipeOutput')
const {buildMapDependencyGraph} = await import('./mapDependencyGraph')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')
const {recipeVisualizations} = await import('./visualizations')

addRecipeType(regression())
addRecipeType(unsupervisedClassification())
addRecipeType(indexChange())
addRecipeType(classChange())
addRecipeType(classification())
addRecipeType(remapping())
addRecipeType(phenology())
addRecipeType(pyeoAlerts())
addRecipeType(landTrendr())

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

    it('exports the bands selected, in the order execution builds them, keeping the most common change class', () => {
        retrieve(read(indexChangeOf()), 'GEE', indexChangeTask, {bands: ['change', 'difference']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['difference', 'change']}, {difference: 'mean', change: 'mode'}]])
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

describe('a classification', () => {
    // In the order execution builds them: the class, what the classifier supports, then one probability per legend
    // entry.
    it.each([
        ['a random forest', 'RANDOM_FOREST', ['class', 'class_probability', 'regression', 'probability_1', 'probability_2']],
        ['a gradient tree boost', 'GRADIENT_TREE_BOOST', ['class', 'class_probability', 'regression', 'probability_1', 'probability_2']],
        ['a support vector machine', 'SVM', ['class', 'class_probability', 'probability_1', 'probability_2']],
        ['a naive Bayes classifier', 'NAIVE_BAYES', ['class', 'class_probability', 'probability_1', 'probability_2']],
        ['a minimum distance classifier', 'MINIMUM_DISTANCE', ['class']],
        ['a decision tree', 'DECISION_TREE', ['class']]
    ])('by %s is described with the bands execution builds, while the recipe it trains on is not even loaded', (_case, type, names) => {
        const {output} = read(classificationOf({classifier: type, trainingRecipe: 'training-1'}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(names)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is described with its probabilities in the order its legend stores its entries, however they are valued', () => {
        const {output} = read(classificationOf({values: [10, 2, 5]}))

        expect(output.bands.map(({name}) => name).filter(name => name.startsWith('probability_')))
            .toEqual(['probability_10', 'probability_2', 'probability_5'])
    })

    it('is described with the bands its classifier supports while its legend has no entries yet', () => {
        const {output} = read(classificationOf({values: []}))

        expect(output.bands.map(({name}) => name)).toEqual(['class', 'class_probability', 'regression'])
    })

    it('is presented with labels, the legend\'s range on its class and regression, percentages on its probabilities, and the preset styles of the bands it has', () => {
        const recipe = classificationOf({classifier: 'SVM'})
        const {output} = read(recipe)

        expect(output.presentation.probability_2.label).toBe('process.classification.bands.probability')
        expect(displayTypes(output)).toEqual({
            class: {precision: 'int', min: 1, max: 2},
            class_probability: {precision: 'int', min: 0, max: 100},
            probability_1: {precision: 'int', min: 0, max: 100},
            probability_2: {precision: 'int', min: 0, max: 100}
        })
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands[0]))
            .toEqual(['class', 'class_probability', 'probability_1', 'probability_2'])
    })

    // The selection is a set of buttons, so the order they were pressed in is no order a user chose.
    it('exports the bands selected in the order execution builds them, keeping the most common class and averaging the rest', () => {
        retrieve(read(classificationOf()), 'GEE', classificationTask, {bands: ['probability_2', 'class', 'regression']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['class', 'regression', 'probability_2']},
            {class: 'mode', regression: 'mean', probability_2: 'mean'}
        ]])
    })

    it('names a saved band its classifier no longer provides, and exports nothing', () => {
        const answer = read(classificationOf({classifier: 'SVM'}))
        const bands = ['class', 'regression']

        retrieve(answer, 'GEE', classificationTask, {bands})

        expect(retrieveDecision({...answer, names: bands, destination: 'GEE', task: classificationTask}))
            .toMatchObject({status: 'BLOCKED', reason: 'MISSING_SELECTION', missingBandNames: ['regression']})
        expect(submitted).toEqual([])
    })
})

describe('a remapping', () => {
    it('is described with its class while the imagery it remaps is not even loaded', () => {
        const {output} = read(remappingOf({images: [{imageId: 'image-1', type: 'RECIPE_REF', id: 'classes-1'}]}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands).toEqual([expect.objectContaining({name: 'class', dataType: {arrayDimensions: 0}})])
    })

    // Execution builds an image without bands when there is no rule to remap by.
    it('is described with no bands, offers no style and cannot be previewed, while its legend has no entries', () => {
        const recipe = remappingOf({values: []})
        const {output} = read(recipe)

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED', bands: []})
        expect(recipeVisualizations(recipe, output.availableBands)).toEqual([])
        expect(canPreview(output)).toBe(false)
    })

    it('is presented with the legend\'s range as cursor precision, and its preset style', () => {
        const recipe = remappingOf()
        const {output} = read(recipe)

        expect(output.presentation.class.label).toBe('process.classification.bands.class')
        expect(displayTypes(output)).toEqual({class: {precision: 'int', min: 1, max: 3}})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands)).toEqual([['class']])
    })

    it('exports its class to Earth Engine keeping the most common class in coarser pyramid levels', () => {
        retrieve(read(remappingOf()), 'GEE', remappingTask)

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy]))
            .toEqual([[{selection: ['class']}, {class: 'mode'}]])
    })
})

const PHENOLOGY_METRICS = [
    'background', 'amplitude', 'median',
    'dayOfYear_1', 'days_1', 'median_1', 'slope_1', 'offset_1',
    'dayOfYear_2', 'days_2', 'median_2', 'slope_2', 'offset_2',
    'dayOfYear_3', 'days_3', 'median_3', 'slope_3', 'offset_3',
    'dayOfYear_4', 'days_4', 'median_4', 'slope_4', 'offset_4'
]
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

describe('a phenology', () => {
    // Its metrics, then its months; a month without observations is a masked band, so neither depends on the imagery.
    it('is described with its metrics and months, while the collection it analyses is not even loaded', () => {
        const {output} = read(phenologyOf({classification: 'classification-1'}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual([...PHENOLOGY_METRICS, ...MONTHS])
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is presented grouped by segment and by month, and offers every preset style', () => {
        const recipe = phenologyOf()
        const {output} = read(recipe)

        expect(displayTypes(output).dayOfYear_1).toEqual({precision: 'int'})
        expect(['slope_1', 'slope_2', 'slope_3', 'slope_4'].map(band => displayTypes(output)[band]))
            .toEqual(Array(4).fill({precision: 'float'}))
        expect(displayTypes(output).january).toEqual({precision: 'float'})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands.join(',')))
            .toEqual(expect.arrayContaining(['dayOfYear_2,days_1,slope_2', 'january', 'december']))
    })

    it('exports the bands selected in the order execution builds them, averaged into coarser pyramid levels', () => {
        retrieve(read(phenologyOf()), 'GEE', phenologyTask, {bands: ['december', 'slope_2', 'background']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['background', 'slope_2', 'december']},
            {background: 'mean', slope_2: 'mean', december: 'mean'}
        ]])
    })
})

describe('a PyEO alerts recipe', () => {
    it('is described with its change report, while the classification it applies is not even loaded', () => {
        const {output} = read(pyeoAlertsOf({classification: 'classification-1'}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands).toHaveLength(18)
        expect(output.bands.slice(0, 3).map(({name}) => name)).toEqual(['available_image_count', 'occluded_count', 'total_changes'])
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is presented with its labels and ranges', () => {
        const {output} = read(pyeoAlertsOf())

        expect(output.presentation.total_changes.label).toBe('Total changes')
        expect(displayTypes(output).post_fcd_change_repeatability_pct).toEqual({precision: 'float', min: 0, max: 100})
    })

    it('exports the bands selected in the order the report holds them, sampled into coarser pyramid levels', () => {
        retrieve(read(pyeoAlertsOf()), 'GEE', pyeoAlertsTask, {bands: ['binary_decision_from_to_map', 'total_changes']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['total_changes', 'binary_decision_from_to_map']},
            {total_changes: 'sample', binary_decision_from_to_map: 'sample'}
        ]])
    })
})

describe('a LandTrendr', () => {
    const CHANGE_BANDS = ['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig']

    it('is described with its change result, while the classification its collection names is not even loaded', () => {
        const {output} = read(landTrendrOf({classification: 'classification-1'}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(CHANGE_BANDS)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is presented with its labels and cursor precision, and offers its change styles', () => {
        const recipe = landTrendrOf()
        const {output} = read(recipe)

        expect(output.presentation.yod.label).toBe('process.landTrendr.bands.yod')
        expect(displayTypes(output)).toMatchObject({yod: {precision: 'int'}, dur: {precision: 'int'}, mag: {precision: 'float'}})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands[0]))
            .toEqual(['mag', 'yod', 'dur', 'preval', 'postval', 'rmse', 'sig'])
    })

    it('exports the bands selected in the order execution builds them, sampling its years and averaging the rest', () => {
        retrieve(read(landTrendrOf()), 'GEE', landTrendrTask, {bands: ['sig', 'dur', 'mag', 'yod']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['yod', 'mag', 'dur', 'sig']},
            {yod: 'sample', mag: 'mean', dur: 'sample', sig: 'mean'}
        ]])
    })

    // The annual context mosaic is another product, still answered by its legacy entry until it is declared.
    it('shows its annual mosaic as before, from the optical bands of that mosaic', () => {
        const recipe = landTrendrOf()
        const product = layerProduct(recipe, {visualizationType: 'mosaics', year: 2020})

        const output = readRecipeOutput({
            recipe,
            product,
            graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
            heldFor: () => null
        })

        expect(product).toEqual({name: 'ANNUAL_MOSAIC', parameters: {year: 2020}})
        expect(output).toMatchObject({status: 'READY', authority: 'LEGACY'})
        expect(output.bands.map(({name}) => name)).toEqual(expect.arrayContaining(['red', 'nir', 'ndvi']))
        expect(output.bands.map(({name}) => name)).not.toContain('yod')
    })
})

describe.each([
    ['a regression', recipe => regressionOf({trainingRecipe: recipe}), regressionTask],
    ['an unsupervised classification', recipe => clusteringOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}]}), clusteringTask],
    ['an index change', recipe => indexChangeOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}, ASSET_IMAGE]}), indexChangeTask],
    ['a class change', recipe => classChangeOf(recipe && {images: [{type: 'RECIPE_REF', id: recipe}, ASSET_IMAGE]}), classChangeTask],
    ['a classification', recipe => classificationOf({trainingRecipe: recipe}), classificationTask],
    ['a remapping', recipe => remappingOf(recipe && {images: [{imageId: 'image-1', type: 'RECIPE_REF', id: recipe}]}), remappingTask],
    ['a phenology', recipe => phenologyOf({classification: recipe}), phenologyTask],
    ['a PyEO alerts recipe', recipe => pyeoAlertsOf({classification: recipe}), pyeoAlertsTask],
    ['a LandTrendr', recipe => landTrendrOf({classification: recipe}), landTrendrTask]
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

const classificationOf = ({classifier = 'RANDOM_FOREST', values = [1, 2], trainingRecipe} = {}) => ({
    id: ID,
    type: 'CLASSIFICATION',
    title: 'Land cover',
    model: {
        inputImagery: {images: [{imageId: 'image-1', type: 'ASSET', id: 'users/x/covariates'}]},
        legend: {entries: values.map(value => ({id: `entry-${value}`, value, label: `class ${value}`, color: '#000000'}))},
        trainingData: {dataSets: trainingRecipe
            ? [{type: 'RECIPE', recipe: trainingRecipe}]
            : [{type: 'SAMPLE_CLASSIFICATION', referenceData: []}]},
        classifier: {type: classifier}
    }
})

const remappingOf = ({images = [{imageId: 'image-1', type: 'ASSET', id: 'users/x/classes'}], values = [1, 2, 3]} = {}) => ({
    id: ID,
    type: 'REMAPPING',
    title: 'Forest',
    model: {
        inputImagery: {images},
        legend: {entries: values.map(value => ({
            id: `entry-${value}`,
            value,
            label: `class ${value}`,
            color: '#000000',
            booleanOperator: 'and',
            constraints: [{image: 'image-1', band: 'class', operator: '=', value}]
        }))}
    }
})

const AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [1, 0]]}

const phenologyOf = ({classification} = {}) => ({
    id: ID,
    type: 'PHENOLOGY',
    title: 'Seasonality',
    model: {
        aoi: AOI,
        dates: {fromYear: 2022, toYear: 2022},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'evi', ...(classification && {classification})},
        options: {corrections: ['SR']}
    }
})

const pyeoAlertsOf = ({classification} = {}) => ({
    id: ID,
    type: 'PYEO_ALERTS',
    title: 'Alerts',
    model: {
        aoi: AOI,
        dates: {monitoringStart: '2023-01-01', monitoringEnd: '2024-01-01'},
        sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, changeFromClasses: [1], changeToClasses: [2], ...(classification && {classification})}
    }
})

const landTrendrOf = ({classification} = {}) => ({
    id: ID,
    type: 'LANDTRENDR',
    title: 'Disturbance',
    model: {
        aoi: AOI,
        dates: {startYear: 2000, endYear: 2024},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr', ...(classification && {classification})},
        options: {corrections: ['SR']},
        landTrendrOptions: {changeDirection: 'LOSS'}
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
