import {beforeEach, describe, expect, it, vi} from 'vitest'

// Regression, Unsupervised Classification, Index Change, Class Change, Classification, Remapping, Phenology, PyEO
// Alerts, LandTrendr, BAYTS Historical, BAYTS Alerts and its radar observation, Change Alerts, Radar Mosaic, Planet
// Mosaic and Time Series through their real registrations, shared declarations, the common read and the generic
// Retrieve submission. Only the task API and notifications are replaced.

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
const {default: baytsHistorical} = await import('./baytsHistorical/baytsHistorical')
const {default: baytsAlerts} = await import('./baytsAlerts/baytsAlerts')
const {default: changeAlerts} = await import('./changeAlerts/changeAlerts')
const {default: radarMosaic} = await import('./radarMosaic/radarMosaic')
const {default: planetMosaic} = await import('./planetMosaic/planetMosaic')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {retrieveTask: regressionTask} = await import('./regression/regressionRecipe')
const {retrieveTask: clusteringTask} = await import('./unsupervisedClassification/unsupervisedClassificationRecipe')
const {retrieveTask: indexChangeTask} = await import('./indexChange/indexChangeRecipe')
const {retrieveTask: classChangeTask} = await import('./classChange/classChangeRecipe')
const {retrieveTask: classificationTask} = await import('./classification/classificationRecipe')
const {retrieveTask: remappingTask} = await import('./remapping/remappingRecipe')
const {retrieveTask: phenologyTask} = await import('./phenology/phenologyRecipe')
const {retrieveTask: pyeoAlertsTask} = await import('./pyeoAlerts/pyeoAlertsRecipe')
const {retrieveTask: landTrendrTask} = await import('./landTrendr/landTrendrRecipe')
const {retrieveTask: baytsHistoricalTask} = await import('./baytsHistorical/baytsHistoricalRecipe')
const {retrieveTask: radarMosaicTask} = await import('./radarMosaic/radarMosaicRecipe')
const {retrieveTask: planetMosaicTask} = await import('./planetMosaic/planetMosaicRecipe')
const {canPreview, displayTypes, layerProduct, productArgs, readRecipeOutput} = await import('./recipeOutput')
const {buildMapDependencyGraph} = await import('./mapDependencyGraph')
const {physicalRequest, readRetrieveOutput, retrieveDecision, submitRetrieve} = await import('./retrieveOutput')

// Storage listed just now: a Retrieve is authorized by it (recipeListing.js).
const CURRENT_LISTING = {checkedAt: Date.now()}
const {recipeVisualizations} = await import('./visualizations')
const {visualizationOptions: landTrendrVisualizationOptions} = await import('./landTrendr/visualizations')
const {groupedBandPresentation: baytsAlertsRetrieveGroups} = await import('./baytsAlerts/bands')
const {visualizationOptions: baytsAlertsVisualizationOptions} = await import('./baytsAlerts/visualizations')
const {groupedBandPresentation: changeAlertsRetrieveGroups} = await import('./changeAlerts/bands')
const {visualizationOptions: changeAlertsVisualizationOptions} = await import('./changeAlerts/visualizations')
const {groupedBandPresentation: radarMosaicRetrieveGroups} = await import('./radarMosaic/bands')
const {groupedBandPresentation: planetMosaicRetrieveGroups} = await import('./planetMosaic/bands')
const {renderableVisualizations} = await import('./visualizationMatching')
const {typedSegmentsAssetDescription} = await import('./ccdc/segmentsAsset')
const {declaredSelections, sourceKeyOf} = await import('./sourceEvidence')
const {historicalStatsOf} = await import('./baytsAlerts/historicalStatistics')

addRecipeType(regression())
addRecipeType(unsupervisedClassification())
addRecipeType(indexChange())
addRecipeType(classChange())
addRecipeType(classification())
addRecipeType(remapping())
addRecipeType(phenology())
addRecipeType(pyeoAlerts())
addRecipeType(landTrendr())
addRecipeType(baytsHistorical())
addRecipeType(baytsAlerts())
addRecipeType(changeAlerts())
addRecipeType(radarMosaic())
addRecipeType(planetMosaic())
addRecipeType(timeSeries())

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
})

// The annual context mosaic a LandTrendr layer can show instead of its changes: an optical mosaic of the year the layer
// names, described from the recipe alone.
describe('a LandTrendr annual mosaic', () => {
    const annualMosaic = (recipe, layerConfig) => readRecipeOutput({
        recipe,
        product: layerProduct(recipe, {visualizationType: 'mosaics', ...layerConfig}),
        graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
        heldFor: () => null
    })

    it('is described as the optical mosaic of the year the layer names, acquiring nothing', () => {
        const output = annualMosaic(landTrendrOf(), {year: 2020})

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED', acquisition: null})
        expect(output.description.output.product).toEqual({name: 'ANNUAL_MOSAIC', parameters: {year: 2020}})
        expect(output.bands.map(({name}) => name)).toEqual(expect.arrayContaining(['red', 'nir', 'ndvi']))
        expect(output.bands.map(({name}) => name)).not.toContain('yod')
        expect(canPreview(output)).toBe(true)
    })

    it('is presented as an optical mosaic is', () => {
        const output = annualMosaic(landTrendrOf(), {year: 2020})

        expect(displayTypes(output).red).toEqual({precision: 'int', min: -32768, max: 32767})
        expect(output.availableBands.nir.tooltip).toBe('bands.nir')
    })

    it('shows the last fitted year to a layer that has stored none', () => {
        expect(annualMosaic(landTrendrOf(), {}).description.output.product.parameters).toEqual({year: 2024})
    })

    // The product takes any integer year; keeping a layer's year within the fitted period is the layer form's choice.
    it('is described for a year outside the fitted range', () => {
        expect(annualMosaic(landTrendrOf(), {year: 1990}).description.output.product.parameters).toEqual({year: 1990})
    })

    it('cannot be previewed for a year that is not an integer', () => {
        const output = annualMosaic(landTrendrOf(), {year: '2020'})

        expect(output).toMatchObject({
            status: 'INVALID',
            description: null,
            diagnostics: [expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year']})]
        })
        expect(canPreview(output)).toBe(false)
    })

    it('offers no styles for a year it cannot show, and those of the mosaic once one it can is chosen', () => {
        const recipe = landTrendrOf()
        const styles = output => landTrendrVisualizationOptions(recipe, output).flatMap(({options}) => options).map(({value}) => value)

        expect(styles(annualMosaic(recipe, {year: '2020'}))).toEqual([])
        expect(styles(annualMosaic(recipe, {year: 2019}))).toContain('red, green, blue')
    })

    // Retrieve reads the canonical output whatever a layer shows.
    it('is not what its recipe exports', () => {
        const {output} = read(landTrendrOf())

        expect(output.description.output.product).toBeUndefined()
        expect(output.bands.map(({name}) => name)).toEqual(['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig'])
    })
})

describe('a BAYTS alerts recipe', () => {
    const ALERTS = ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date']

    it('is described with its alerts, while the historical recipe it monitors is not even loaded', () => {
        const output = described(baytsAlertsOf({reference: {type: 'RECIPE_REF', id: 'bayts-historical-1'}}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(ALERTS)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    // Its alerts do not depend on the historical recipe's bands, which BAYTS Alerts reads by name when it runs.
    it('is described with the same alerts over a historical recipe the session holds', () => {
        const historical = baytsHistoricalOf({id: 'bayts-historical-1'})
        const alerts = baytsAlertsOf({reference: {type: 'RECIPE_REF', id: historical.id}})

        const output = described(alerts, historical)

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(ALERTS)
    })

    it('is presented with whole flags and orbits, fractional probabilities and dates, and offers its alert styles', () => {
        const recipe = baytsAlertsOf()
        const {output} = read(recipe)

        expect(displayTypes(output)).toEqual({
            non_forest_probability: {precision: 'float'},
            change_probability: {precision: 'float'},
            flag: {precision: 'int'},
            flag_orbit: {precision: 'int'},
            first_detection_date: {precision: 'float'},
            confirmation_date: {precision: 'float'}
        })
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands[0]))
            .toEqual(['change_probability', 'flag', 'first_detection_date', 'confirmation_date'])
    })

    it('is offered for retrieval in its probability and date groups', () => {
        expect(baytsAlertsRetrieveGroups().map(group => group.map(({value}) => value))).toEqual([
            ['non_forest_probability', 'change_probability', 'flag', 'flag_orbit'],
            ['first_detection_date', 'confirmation_date']
        ])
    })

    it('exports the bands selected in the order execution builds them, all sampled', () => {
        retrieve(read(baytsAlertsOf()), 'GEE', undefined, {bands: ['confirmation_date', 'flag', 'change_probability']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['change_probability', 'flag', 'confirmation_date']},
            {change_probability: 'sample', flag: 'sample', confirmation_date: 'sample'}
        ]])
    })
})

// The radar observation a layer can show instead of the alerts: a point-in-time Radar Mosaic around the first or last
// date of the monitoring period, described from the recipe alone.
describe('a BAYTS alerts radar observation', () => {
    const layerRead = (recipe, layerConfig, loadedRecipes = {[recipe.id]: recipe}) => readRecipeOutput({
        recipe,
        product: layerProduct(recipe, layerConfig),
        graph: buildMapDependencyGraph({recipe, loadedRecipes}),
        heldFor: () => null
    })

    it.each(['first', 'last'])('is described at its %s position as Radar Mosaic declares a point in time, acquiring nothing', position => {
        const output = layerRead(baytsAlertsOf(), {visualizationType: position})

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED', acquisition: null})
        expect(output.description.output.product).toEqual({name: 'RADAR_OBSERVATION', parameters: {position}})
        expect(output.bands).toEqual(RADAR_OBSERVATION_BANDS)
        expect(canPreview(output)).toBe(true)
    })

    it.each(['first', 'last'])('is presented at its %s position as a radar mosaic, with the radar styles and the arguments execution takes', position => {
        const recipe = baytsAlertsOf()
        const layerConfig = {visualizationType: position}
        const output = layerRead(recipe, layerConfig)

        expect(displayTypes(output)).toMatchObject({orbit: {precision: 'int'}, VV: {precision: 'float'}})
        const styles = baytsAlertsVisualizationOptions(recipe, position).flatMap(({options}) => options).map(({visParams}) => visParams)
        expect(styles).not.toHaveLength(0)
        expect(renderableVisualizations(styles, output.availableBands)).toEqual(styles)
        expect(productArgs(recipe, layerConfig)).toEqual({visualizationType: position, previouslyConfirmed: 'exclude', minConfidence: 'high'})
    })

    it('cannot be previewed at a position it does not know, and is never answered otherwise', () => {
        const recipe = baytsAlertsOf()
        const output = readRecipeOutput({
            recipe,
            product: {name: 'RADAR_OBSERVATION', parameters: {position: 'middle'}},
            graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
            heldFor: () => null
        })

        expect(output).toMatchObject({
            status: 'INVALID',
            authority: null,
            bands: [],
            diagnostics: [expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'position']})]
        })
        expect(canPreview(output)).toBe(false)
    })

    // A recipe whose monitoring period has no end yet: the radar observation cannot be placed, the alerts still describe.
    it('cannot be previewed before its monitoring period ends, while its alerts are described', () => {
        const recipe = {...baytsAlertsOf(), model: {...baytsAlertsOf().model, date: {monitoringDuration: 2, monitoringDurationUnit: 'months'}}}

        const output = layerRead(recipe, {visualizationType: 'last'})

        expect(output).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringEnd']})]
        })
        expect(canPreview(output)).toBe(false)
        expect(layerRead(recipe, {visualizationType: 'alerts'}).bands.map(({name}) => name)).toContain('flag')
    })

    it.each([
        ['that is not loaded, until its dependencies are completed', {reference: {type: 'RECIPE_REF', id: 'bayts-historical-1'}}, 'DEPENDENCIES'],
        ['that is selected without an id', {reference: {type: 'RECIPE_REF'}}, null],
        ['that is itself', {reference: {type: 'RECIPE_REF', id: ID}}, null]
    ])('is described but not previewed over a reference %s', (_case, model, acquiring) => {
        const recipe = {...baytsAlertsOf(), model: {...baytsAlertsOf().model, ...model}}

        const output = layerRead(recipe, {visualizationType: 'first'})

        expect(output.bands).toEqual(RADAR_OBSERVATION_BANDS)
        expect(output.acquisition?.kind ?? null).toBe(acquiring)
        expect(canPreview(output)).toBe(false)
    })

    // Nothing diagnoses a recipe that has chosen no reference yet, so the read permits a preview once the product's dates
    // are met, which Earth Engine would fail; recorded in the recipe notes rather than decided here.
    it('is not held back from preview by its reference while none is chosen at all', () => {
        const recipe = {...baytsAlertsOf(), model: {...baytsAlertsOf().model, reference: undefined}}

        const output = layerRead(recipe, {visualizationType: 'first'})

        expect(output.dependencyValidity).toEqual({status: 'VALID', diagnostics: []})
        expect(canPreview(output)).toBe(true)
    })

    // Retrieve reads the canonical output whatever a layer shows.
    it('is not what its recipe exports', () => {
        const {output} = read(baytsAlertsOf())

        expect(output.description.output.product).toBeUndefined()
        expect(output.bands.map(({name}) => name)).toEqual(['non_forest_probability', 'change_probability', 'flag', 'flag_orbit', 'first_detection_date', 'confirmation_date'])
    })
})

describe('a Change Alerts recipe', () => {
    const CHANGES = [
        'last_stable_date', 'first_detection_date', 'confirmation_date', 'last_detection_date', 'confidence', 'difference',
        'detection_count', 'monitoring_observation_count', 'calibration_observation_count'
    ]

    it('is described with its changes in the order execution builds them, while the CCDC it monitors is not even loaded', () => {
        const output = described(changeAlertsOf({reference: {type: 'RECIPE_REF', id: 'ccdc-1'}}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(CHANGES)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    // What a recipe still being configured provides is known; whether it can run is not, and nothing here says it can:
    // no style is offered, and execution refuses a missing period.
    it('is described with the same changes before a period or a reference is chosen, offering no style', () => {
        const recipe = changeAlertsOf({reference: {}, date: {...PERIOD, monitoringEnd: undefined}})
        const output = described(recipe)

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(CHANGES)
        expect(recipeVisualizations(recipe, output.availableBands)).toEqual([])
    })

    it('is presented with whole counts and fractional dates and measures, and offers its change styles', () => {
        const recipe = changeAlertsOf()
        const output = described(recipe)

        expect(displayTypes(output)).toEqual({
            last_stable_date: {precision: 'float'},
            first_detection_date: {precision: 'float'},
            confirmation_date: {precision: 'float'},
            last_detection_date: {precision: 'float'},
            confidence: {precision: 'float'},
            difference: {precision: 'float'},
            detection_count: {precision: 'int'},
            monitoring_observation_count: {precision: 'int'},
            calibration_observation_count: {precision: 'int'}
        })
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands[0])).toEqual([
            'confidence', 'difference', 'detection_count',
            'last_stable_date', 'first_detection_date', 'confirmation_date', 'last_detection_date',
            'monitoring_observation_count', 'calibration_observation_count'
        ])
    })

    it('is offered for retrieval in its change, date and observation groups', () => {
        expect(changeAlertsRetrieveGroups().map(group => group.map(({value}) => value))).toEqual([
            ['confidence', 'difference', 'detection_count'],
            ['last_stable_date', 'first_detection_date', 'confirmation_date', 'last_detection_date'],
            ['monitoring_observation_count', 'calibration_observation_count']
        ])
    })

    it('exports the bands selected in the order execution builds them, all sampled', () => {
        retrieve(read(changeAlertsOf()), 'GEE', undefined, {bands: ['calibration_observation_count', 'confidence', 'last_stable_date']})

        expect(submitted.map(({params: {image}}) => [image.bands, image.pyramidingPolicy])).toEqual([[
            {selection: ['last_stable_date', 'confidence', 'calibration_observation_count']},
            {last_stable_date: 'sample', confidence: 'sample', calibration_observation_count: 'sample'}
        ]])
    })

    it('is neither previewed nor exported while the CCDC it monitors is found missing', () => {
        const recipe = changeAlertsOf({reference: {type: 'RECIPE_REF', id: 'ccdc-1'}})
        const {description} = described(recipe)
        const missing = {status: 'READY', description, dependencyValidity: {status: 'INVALID', diagnostics: [{code: 'MISSING_SOURCE'}]}}
        const answer = readRetrieveOutput({
            state: {process: {recipeListing: CURRENT_LISTING, loadedRecipes: {[recipe.id]: recipe}}},
            recipeId: recipe.id,
            heldFor: () => missing
        })

        retrieve(answer, 'GEE')

        expect(answer.output.bands.map(({name}) => name)).toEqual(CHANGES)
        expect(canPreview(answer.output)).toBe(false)
        expect(submitted).toEqual([])
    })

    // The mosaics a layer can show instead are another product, described as the mosaic Change Alerts' own model
    // builds: in the order execution builds it, with that mosaic type's own shapes, encodings and policies.
    describe.each([
        ['monitoring', 'latest'],
        ['monitoring', 'median'],
        ['calibration', 'latest'],
        ['calibration', 'median']
    ])('%s %s mosaic', (period, mosaicType) => {
        const layerConfig = {visualizationType: period, mosaicType}

        it('is described as the optical mosaic, presented and styled as one, from the arguments execution takes', () => {
            const recipe = changeAlertsOf()
            const {product, output} = layerRead(recipe, layerConfig)

            expect(product).toEqual({name: 'COLLECTION_MOSAIC', parameters: {period, mosaicType}})
            expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
            expect(output.description.output.product).toEqual(product)
            expect(output.bands.map(({name}) => name)).toEqual(OPTICAL_MOSAIC_BANDS)
            expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
            expect(output.availableBands.ndvi.encoding).toEqual({scale: 0.0001, offset: 0, unit: '1'})
            expect(displayTypes(output).red).toEqual({precision: 'int', min: -32768, max: 32767})
            const styles = changeAlertsVisualizationOptions(recipe, period, mosaicType).flatMap(({options}) => options).map(({visParams}) => visParams)
            expect(renderableVisualizations(styles, output.availableBands).map(({bands}) => bands)).toContainEqual(['red', 'green', 'blue'])
            expect(productArgs(recipe, layerConfig)).toEqual({visualizationType: period, mosaicType})
        })

        // There is no mosaic without a period to build it around, while the changes are still described.
        it('is refused before a period is chosen, and cannot be previewed', () => {
            const recipe = changeAlertsOf({date: {...PERIOD, monitoringEnd: undefined}})
            const {output} = layerRead(recipe, layerConfig)

            expect(output).toMatchObject({
                status: 'INVALID',
                bands: [],
                diagnostics: [expect.objectContaining({code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringEnd']})]
            })
            expect(canPreview(output)).toBe(false)
            expect(layerRead(recipe, {visualizationType: 'changes'}).output.bands.map(({name}) => name)).toEqual(CHANGES)
        })
    })

    // A latest radar mosaic stands at the period's end or start, and a median one scans the period.
    it.each([
        ['monitoring', 'latest', RADAR_POINT_IN_TIME, ['VV', 'VH', 'ratio_VV_VH']],
        ['calibration', 'median', RADAR_TIME_SCAN, ['VV_med', 'VH_med', 'VV_std']]
    ])('shows the radar %s %s mosaic as Radar Mosaic declares it, with whole orbits and its styles', (period, mosaicType, bands, style) => {
        const recipe = changeAlertsOf({sources: RADAR_SOURCES})
        const layerConfig = {visualizationType: period, mosaicType}
        const {output} = layerRead(recipe, layerConfig)

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(bands)
        expect(output.bands.find(({name}) => name === 'orbit').pyramidingPolicy).toBe('mode')
        expect(displayTypes(output).orbit).toEqual({precision: 'int'})
        const styles = changeAlertsVisualizationOptions(recipe, period, mosaicType).flatMap(({options}) => options).map(({visParams}) => visParams)
        expect(renderableVisualizations(styles, output.availableBands).map(({bands}) => bands)).toContainEqual(style)
    })

    it.each([
        ['monitoring', 'latest'],
        ['calibration', 'median']
    ])('shows the Planet %s %s mosaic as Planet Mosaic declares it, kndvi included, with its styles', (period, mosaicType) => {
        const recipe = changeAlertsOf({sources: PLANET_SOURCES})
        const {output} = layerRead(recipe, {visualizationType: period, mosaicType})

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(PLANET_BANDS)
        const styles = changeAlertsVisualizationOptions(recipe, period, mosaicType).flatMap(({options}) => options).map(({visParams}) => visParams)
        expect(renderableVisualizations(styles, output.availableBands).map(({bands}) => bands)).toContainEqual(['red', 'green', 'blue'])
        expect(renderableVisualizations(styles, output.availableBands)).toContainEqual(expect.objectContaining({bands: ['kndvi'], min: [0], max: [10000]}))
    })

    it('refuses a Planet mosaic with no Planet collection to build it from, and cannot preview it', () => {
        const recipe = changeAlertsOf({sources: {...PLANET_SOURCES, dataSets: {}}})
        const {output} = layerRead(recipe, {visualizationType: 'monitoring', mosaicType: 'latest'})

        expect(output).toMatchObject({
            status: 'INVALID',
            diagnostics: [expect.objectContaining({code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'sources', 'dataSets', 'PLANET']})]
        })
        expect(canPreview(output)).toBe(false)
    })

    // Retrieve reads the canonical output whatever a layer shows.
    it('is not what its recipe exports', () => {
        const {output} = read(changeAlertsOf())

        expect(output.description.output.product).toBeUndefined()
        expect(output.bands.map(({name}) => name)).toEqual(CHANGES)
    })
})

describe('a BAYTS Historical', () => {
    it('is described with each pass\'s statistics in the order its model stores the passes, while the recipe its AOI comes from is not even loaded', () => {
        const {output} = read(baytsHistoricalOf({orbits: ['DESCENDING', 'ASCENDING'], aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual([...historicalPass('desc'), ...historicalPass('asc')])
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is presented with whole orbits for both passes, and offers the styles of the passes it has', () => {
        const recipe = baytsHistoricalOf({orbits: ['ASCENDING']})
        const {output} = read(recipe)

        expect(displayTypes(output)).toEqual(Object.fromEntries(historicalPass('asc').map(name =>
            [name, {precision: name.startsWith('orbit_') ? 'int' : 'float'}])))
        expect(displayTypes(read(baytsHistoricalOf({orbits: ['DESCENDING']})).output).orbit_desc).toEqual({precision: 'int'})
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands))
            .toEqual([['VV_mean_asc', 'VH_mean_asc', 'VV_std_asc']])
    })

    it('exports all its bands in the order execution builds them, keeping the most common orbit', () => {
        retrieve(read(baytsHistoricalOf({orbits: ['DESCENDING', 'ASCENDING']})), 'GEE', baytsHistoricalTask)

        const [{params: {image}}] = submitted
        expect(image.bands.selection).toEqual([...historicalPass('desc'), ...historicalPass('asc')])
        expect(image.pyramidingPolicy).toEqual(Object.fromEntries(image.bands.selection.map(name =>
            [name, name.startsWith('orbit_') ? 'mode' : 'mean'])))
    })

    it('can be neither previewed nor exported with orbits that name no bands', () => {
        const answer = read(baytsHistoricalOf({orbits: ['ASCENDING', 'ASCENDING']}))

        retrieve(answer, 'GEE', baytsHistoricalTask)

        expect(answer.output).toMatchObject({status: 'INVALID', bands: []})
        expect(canPreview(answer.output)).toBe(false)
        expect(submitted).toEqual([])
    })

    // Reading itself as its own AOI: its bands are still known, and none of them may be run.
    it('is neither previewed nor exported over dependencies known to be broken', () => {
        const answer = read(baytsHistoricalOf({aoi: {type: 'RECIPE', id: ID}}))

        retrieve(answer, 'GEE', baytsHistoricalTask)

        expect(answer.output.bands).not.toHaveLength(0)
        expect(answer.output.dependencyValidity.status).toBe('INVALID')
        expect(canPreview(answer.output)).toBe(false)
        expect(submitted).toEqual([])
    })
})

// A time series has no generic Retrieve: its own panel downloads a measure of its collection, never this image.
describe('a Time Series', () => {
    it('is described with its count alone while the recipe its AOI comes from is not even loaded', () => {
        const {output} = read(timeSeriesOf({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands).toEqual([{name: 'count', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}])
    })

    it('is presented with its label and whole counts, and its preset style renders over it', () => {
        const recipe = timeSeriesOf()
        const {output} = read(recipe)
        const styles = recipeVisualizations(recipe, output.availableBands)

        expect(output.presentation.count.label).toBe('process.timeSeries.bands.count')
        expect(displayTypes(output)).toEqual({count: {precision: 'int'}})
        expect(renderableVisualizations(styles, output.availableBands))
            .toEqual([expect.objectContaining({type: 'continuous', bands: ['count'], min: [0], max: [100]})])
    })

    it('shows its image on the map, whatever its layer saved', () => {
        expect(layerProduct(timeSeriesOf(), {visualizationType: 'COUNT'})).toEqual({name: 'IMAGE_OUTPUT'})
    })

    // Reading itself as its own AOI: its count is still known, and cannot be shown.
    it('is not previewed over dependencies known to be broken', () => {
        const {output} = read(timeSeriesOf({aoi: {type: 'RECIPE', id: ID}}))

        expect(output.bands.map(({name}) => name)).toEqual(['count'])
        expect(output.dependencyValidity.status).toBe('INVALID')
        expect(canPreview(output)).toBe(false)
    })
})

describe('a Planet Mosaic', () => {
    it('is described with its spectral bands and indexes, while the recipe its AOI comes from is not even loaded', () => {
        const {output} = read(planetMosaicOf({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(PLANET_BANDS)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it('is presented with whole numbers stored per ten thousand, and offers its combination and index styles', () => {
        const recipe = planetMosaicOf()
        const {output} = read(recipe)

        expect(displayTypes(output)).toEqual(Object.fromEntries(PLANET_BANDS.map(name =>
            [name, {precision: 'int', min: -10000, max: 10000}])))
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands)).toEqual([
            ['red', 'green', 'blue'], ['nir', 'red', 'green'], ['ndvi'], ['ndwi'], ['evi'], ['evi2'], ['savi'], ['kndvi']
        ])
        expect(recipeVisualizations(recipe, output.availableBands)).toContainEqual(expect.objectContaining({bands: ['kndvi'], min: [0], max: [10000]}))
    })

    it('offers every band for retrieval, its spectral bands then its indexes', () => {
        const groups = planetMosaicRetrieveGroups().map(group => group.map(({value}) => value))

        expect(groups).toEqual([['blue', 'green', 'red', 'nir'], ['ndvi', 'ndwi', 'evi', 'evi2', 'savi', 'kndvi']])
        expect(groups.flat()).toEqual(read(planetMosaicOf()).output.bands.map(({name}) => name))
    })

    it('exports the bands selected in the order execution builds them, all averaged', () => {
        retrieve(read(planetMosaicOf()), 'GEE', planetMosaicTask, {bands: ['kndvi', 'red', 'ndvi']})

        expect(submitted.map(({params: {image}}) => [image.bands.selection, image.pyramidingPolicy])).toEqual([[
            ['red', 'ndvi', 'kndvi'],
            {red: 'mean', ndvi: 'mean', kndvi: 'mean'}
        ]])
    })
})

describe('a Radar Mosaic', () => {
    it('is described as a time scan - its statistics, then each polarisation\'s harmonics - while the recipe its AOI comes from is not even loaded', () => {
        const {output} = read(radarMosaicOf({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(output).toMatchObject({status: 'READY', authority: 'DESCRIBED'})
        expect(output.bands.map(({name}) => name)).toEqual(RADAR_TIME_SCAN)
        expect(output.bands.every(({dataType}) => dataType.arrayDimensions === 0)).toBe(true)
    })

    it.each([
        ['a target date', {targetDate: '2024-06-01'}],
        ['a target date beside a period', {targetDate: '2024-06-01', ...TIME_SCAN_DATES}]
    ])('is described as a point in time for %s', (_case, dates) => {
        expect(read(radarMosaicOf({dates})).output.bands.map(({name}) => name)).toEqual(RADAR_POINT_IN_TIME)
    })

    it('is described as a time scan while it states no dates', () => {
        expect(read(radarMosaicOf({dates: {}})).output.bands.map(({name}) => name)).toEqual(RADAR_TIME_SCAN)
    })

    it('is presented as a point in time with whole orbits and days, and offers its combination and date styles', () => {
        const recipe = radarMosaicOf({dates: {targetDate: '2024-06-01'}})
        const {output} = read(recipe)

        expect(displayTypes(output)).toEqual({
            VV: {precision: 'float'},
            VH: {precision: 'float'},
            ratio_VV_VH: {precision: 'float'},
            orbit: {precision: 'int'},
            dayOfYear: {precision: 'int', min: 0, max: 366},
            daysFromTarget: {precision: 'int', min: 0, max: 183}
        })
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands))
            .toEqual([['VV', 'VH', 'ratio_VV_VH'], ['dayOfYear'], ['daysFromTarget']])
    })

    it('is presented as a time scan with a whole orbit, and offers its combination and harmonic styles', () => {
        const recipe = radarMosaicOf()
        const {output} = read(recipe)

        expect(displayTypes(output)).toEqual(Object.fromEntries(RADAR_TIME_SCAN.map(name =>
            [name, {precision: name === 'orbit' ? 'int' : 'float'}])))
        expect(recipeVisualizations(recipe, output.availableBands).map(({bands}) => bands)).toEqual([
            ['VV_max', 'VH_min', 'NDCV'],
            ['VV_med', 'VH_med', 'VV_std'],
            ['VV_med', 'VH_med', 'ratio_VV_med_VH_med'],
            ['VV_max', 'VV_min', 'VV_std'],
            ['VV_min', 'VH_min', 'VV_std'],
            ['VV_phase', 'VV_amp', 'VV_res'],
            ['VH_phase', 'VH_amp', 'VH_res']
        ])
    })

    it.each([
        ['a point in time', {targetDate: '2024-06-01'}, [
            ['VV', 'VH', 'ratio_VV_VH'],
            ['orbit', 'dayOfYear', 'daysFromTarget']
        ]],
        ['a time scan', TIME_SCAN_DATES, [
            ['VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VV_cv'],
            ['VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'VH_cv'],
            ['ratio_VV_med_VH_med', 'NDCV'],
            ['VV_const', 'VV_t', 'VV_phase', 'VV_amp', 'VV_res'],
            ['VH_const', 'VH_t', 'VH_phase', 'VH_amp', 'VH_res'],
            ['orbit']
        ]]
    ])('offers every band of %s for retrieval, in its groups', (_case, dates, groups) => {
        const recipe = radarMosaicOf({dates})

        expect(radarMosaicRetrieveGroups(recipe).map(group => group.map(({value}) => value))).toEqual(groups)
        expect(groups.flat().sort()).toEqual(read(recipe).output.bands.map(({name}) => name).sort())
    })

    it.each([
        ['a point in time', {targetDate: '2024-06-01'}, ['daysFromTarget', 'orbit', 'VV'],
            {VV: 'mean', orbit: 'mode', daysFromTarget: 'sample'}],
        ['a time scan', TIME_SCAN_DATES, ['VH_phase', 'orbit', 'VV_const', 'VV_min'],
            {VV_min: 'mean', orbit: 'mode', VV_const: 'mean', VH_phase: 'sample'}]
    ])('exports bands of %s in the order execution builds them, keeping orbits, dates and phases whole', (_case, dates, chosen, policies) => {
        retrieve(read(radarMosaicOf({dates})), 'GEE', radarMosaicTask, {bands: chosen})

        expect(submitted.map(({params: {image}}) => [image.bands.selection, image.pyramidingPolicy]))
            .toEqual([[Object.keys(policies), policies]])
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
    ['a LandTrendr', recipe => landTrendrOf({classification: recipe}), landTrendrTask],
    ['a BAYTS alerts recipe', recipe => baytsAlertsOf(recipe && {reference: {type: 'RECIPE_REF', id: recipe}}), undefined],
    ['a Change Alerts recipe', recipe => changeAlertsOf(recipe && {reference: {type: 'RECIPE_REF', id: recipe}}), undefined],
    ['a Radar Mosaic', recipe => radarMosaicOf(recipe && {aoi: {type: 'RECIPE', id: recipe}}), radarMosaicTask],
    ['a Planet Mosaic', recipe => planetMosaicOf(recipe && {aoi: {type: 'RECIPE', id: recipe}}), planetMosaicTask]
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

// Monitoring a historical asset unless told otherwise, so that nothing it reads has to be loaded. Its editor observed
// that asset and found the statistics of both passes, as its evidence lifecycle publishes them (`ui.sourceEvidence`).
const baytsAlertsOf = ({reference = {type: 'ASSET', id: 'users/x/bayts-historical'}} = {}) => ({
    id: ID,
    type: 'BAYTS_ALERTS',
    title: 'Alerts',
    model: {
        reference,
        date: {monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
        options: {orbits: ['ASCENDING', 'DESCENDING']},
        baytsAlertsOptions: {}
    },
    ...(reference.type === 'ASSET' && {ui: {sourceEvidence: historicalStatsObserved(reference)}})
})

// An image asset's historical statistics as the observation reads them from its metadata: each band scalar.
const historicalStatsObserved = reference => {
    const bands = ['asc', 'desc'].flatMap(suffix =>
        ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle'].map(statistic => `${statistic}_${suffix}`)
    )
    return {
        status: 'OBSERVED',
        sourceKey: sourceKeyOf(reference),
        historicalStats: historicalStatsOf({
            producer: {assetId: reference.id},
            metadata: {
                type: 'Image',
                bandNames: bands,
                bands: bands.map(id => ({id, dimensions: [5015, 3093], data_type: {type: 'PixelType', precision: 'float'}})),
                properties: {}
            }
        })
    }
}

const PERIOD = {
    monitoringEnd: '2024-01-01',
    monitoringDuration: 2,
    monitoringDurationUnit: 'months',
    calibrationDuration: 3,
    calibrationDurationUnit: 'months'
}

const OPTICAL_SOURCES = {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}}
const RADAR_SOURCES = {band: 'VV', dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}
const PLANET_SOURCES = {band: 'ndvi', dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}, assets: ['users/x/daily']}

// Monitoring a segments asset unless told otherwise, so that nothing it reads has to be loaded. Its editor observed that
// asset and found segments for the monitored band, as its evidence lifecycle publishes them (`ui.sourceEvidence`).
const changeAlertsOf = ({reference = {type: 'ASSET', id: 'users/x/segments'}, date = PERIOD, sources = OPTICAL_SOURCES} = {}) => ({
    id: ID,
    type: 'CHANGE_ALERTS',
    title: 'Alerts',
    model: {
        reference,
        date,
        sources,
        options: {corrections: ['SR']},
        changeAlertsOptions: {minConfidence: 5, numberOfObservations: 3, minNumberOfChanges: 3}
    },
    ...(reference.type === 'ASSET' && {ui: {sourceEvidence: segmentsObserved(reference, sources.band)}})
})

// An image asset's segments as the observation reads them from its metadata: each band's grid, and its array rank.
const segmentsObserved = (reference, band) => {
    const bands = [['tStart', 1], ['tEnd', 1], [`${band}_coefs`, 2], [`${band}_rmse`, 1]]
    return {
        status: 'OBSERVED',
        sourceKey: sourceKeyOf(reference),
        segments: typedSegmentsAssetDescription({
            type: 'Image',
            bandNames: bands.map(([name]) => name),
            bands: bands.map(([id, dimensions]) => ({id, dimensions: [5015, 3093], data_type: {type: 'PixelType', precision: 'double', dimensions}})),
            properties: {dateFormat: 1}
        }, {assetId: reference.id})
    }
}

const RADAR_POINT_IN_TIME = ['VV', 'VH', 'ratio_VV_VH', 'orbit', 'dayOfYear', 'daysFromTarget']

// A point-in-time Radar Mosaic's bands, as the radar observation a BAYTS alerts layer shows is described.
const RADAR_OBSERVATION_BANDS = [
    ['VV', 'mean'], ['VH', 'mean'], ['ratio_VV_VH', 'mean'], ['orbit', 'mode'], ['dayOfYear', 'sample'], ['daysFromTarget', 'sample']
].map(([name, pyramidingPolicy]) => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy}))
const RADAR_TIME_SCAN = [
    'VV_min', 'VV_max', 'VV_mean', 'VV_std', 'VV_med', 'VH_min', 'VH_max', 'VH_mean', 'VH_std', 'VH_med',
    'ratio_VV_med_VH_med', 'VV_cv', 'VH_cv', 'NDCV', 'orbit',
    'VV_phase', 'VV_amp', 'VV_res', 'VV_const', 'VV_t', 'VH_phase', 'VH_amp', 'VH_res', 'VH_const', 'VH_t'
]
const TIME_SCAN_DATES = {fromDate: '2024-01-01', toDate: '2025-01-01'}

// An AOI drawn on the map unless told otherwise, so that nothing it reads has to be loaded.
const radarMosaicOf = ({dates = TIME_SCAN_DATES, aoi = AOI} = {}) => ({
    id: ID,
    type: 'RADAR_MOSAIC',
    title: 'Radar',
    model: {aoi, dates, options: {orbits: ['ASCENDING', 'DESCENDING']}}
})

// An AOI drawn on the map unless told otherwise, so that nothing it reads has to be loaded.
const timeSeriesOf = ({aoi = AOI} = {}) => ({
    id: ID,
    type: 'TIME_SERIES',
    title: 'Observations',
    model: {
        aoi,
        dates: {startDate: '2023-01-01', endDate: '2024-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: []}
    }
})

const historicalPass = suffix => ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']
    .map(statistic => `${statistic}_${suffix}`)

// An AOI drawn on the map unless told otherwise, so that nothing it reads has to be loaded.
const baytsHistoricalOf = ({id = ID, orbits = ['ASCENDING', 'DESCENDING'], aoi = AOI} = {}) => ({
    id,
    type: 'BAYTS_HISTORICAL',
    title: 'Historical',
    model: {
        aoi,
        dates: {fromDate: '2023-01-01', toDate: '2024-01-01'},
        options: {orbits, spatialSpeckleFilter: 'LEE', multitemporalSpeckleFilter: 'NONE'}
    }
})

const PLANET_BANDS = ['blue', 'green', 'red', 'nir', 'ndvi', 'ndwi', 'evi', 'evi2', 'savi', 'kndvi']

// A median Landsat 8 surface-reflectance mosaic, as Optical Mosaic declares it and execution builds it.
const OPTICAL_MOSAIC_BANDS = [
    'aerosol', 'blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'thermal',
    'brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth',
    'ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'mvi', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi',
    'bui', 'kndvi'
]

// An AOI drawn on the map unless told otherwise, so that nothing it reads has to be loaded.
const planetMosaicOf = ({aoi = AOI} = {}) => ({
    id: ID,
    type: 'PLANET_MOSAIC',
    title: 'Planet',
    model: {
        aoi,
        dates: {fromDate: '2024-01-01', toDate: '2024-04-01'},
        sources: {source: 'BASEMAPS', assets: ['users/x/basemaps']},
        options: {histogramMatching: 'DISABLED', cloudThreshold: 0.15, shadowThreshold: 0.4, cloudBuffer: 0}
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
const read = recipe => readAll([recipe])

// The read a Retrieve panel makes of the first recipe, with the others loaded beside it and nothing retained. What a
// recipe's evidence lifecycle published on it was observed on a basis current for this read, and the asset it was read
// from was just checked.
const readAll = ([recipe, ...others]) => {
    const owners = {}
    const records = [recipe, ...others].map(record => observedNow(record, owners))
    return readRetrieveOutput({
        state: {process: {
            recipeListing: CURRENT_LISTING,
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            assetEvidence: {generation: 0, assets: Object.fromEntries(records.flatMap(checkedAssets))}
        }},
        recipeId: recipe.id,
        heldFor: () => null,
        evidenceOwnerOf: id => owners[id] || null
    })
}

const observedNow = (record, owners) => {
    const evidence = record.ui?.sourceEvidence
    if (!evidence) {
        return record
    }
    const observationId = `observation-${record.id}`
    owners[record.id] = {
        observationId,
        basis: {key: evidence.sourceKey, selections: declaredSelections(record), earthEngineGeneration: 0, refreshed: 0, dependencies: []},
        observes: true,
        records: 'COMPLETE'
    }
    return {...record, ui: {...record.ui, sourceEvidence: {...evidence, observationId}}}
}

const checkedAssets = record => {
    const evidence = record.ui?.sourceEvidence
    const assetId = evidence?.segments?.typedBands?.assetId || evidence?.historicalStats?.assetId
    return assetId ? [[assetId, {version: 'v1', checkedAt: Date.now(), changedAt: null, failure: null}]] : []
}

// What the recipe's output is described as, whatever its sources are found to be, with the others loaded beside it.
const described = (recipe, ...others) => readRecipeOutput({
    recipe,
    product: {name: 'IMAGE_OUTPUT'},
    graph: buildMapDependencyGraph({recipe, loadedRecipes: Object.fromEntries([recipe, ...others].map(record => [record.id, record]))}),
    heldFor: () => null
})

// The read a layer makes of the product its config names, with nothing but the recipe itself loaded.
const layerRead = (recipe, layerConfig) => {
    const product = layerProduct(recipe, layerConfig)
    const output = readRecipeOutput({
        recipe,
        product,
        graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
        heldFor: () => null
    })
    return {product, output}
}

const retrieve = ({recipe, output, pending}, destination, task, selection = {useAllBands: true}) => submitRetrieve({
    recipe,
    output,
    pending,
    request: physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination, ...selection}}),
    task
})
