// The non-edge inventory: fields that hold, or look like they hold, a source but are not edges.
//
// Declared explicitly so the completeness audit has something to check against, and so the reasoning is
// reviewable rather than implied by absence. Test-only, and deliberately outside src: it records what a
// migration decided about a model, not behavior any runtime needs.
//
// Paths are prefixes - a pattern classifies everything nested under it - unless declared exact, which
// classifies only the value at that path and nothing below it.

const NON_EDGES = new Map([
    ['CCDC', [
        {path: ['model', 'sources', 'dataSets'], reason: 'Data set identifiers, not asset ids'},
        {path: ['model', 'sources', 'breakpointBands'], reason: 'Band names'}
    ]],
    ['CCDC_SLICE', [
        {path: ['model', 'source', 'bands'], reason: 'Band schema copied off the source when it was selected'},
        {path: ['model', 'source', 'baseBands'], reason: 'CCDC base bands copied off the source'},
        {path: ['model', 'source', 'segmentBands'], reason: 'CCDC segment bands copied off the source'},
        {path: ['model', 'source', 'visualizations'], reason: 'Source presets copied off the source'},
        {path: ['model', 'source', 'dateFormat'], reason: 'Date interpretation copied off the source'},
        {path: ['model', 'source', 'startDate'], reason: 'Copied off the source'},
        {path: ['model', 'source', 'endDate'], reason: 'Copied off the source'},
        {path: ['model', 'source', 'targetType'], reason: 'Records what the selected recipe resolved to; the edge stays the selected recipe'}
    ]],
    ['CLASSIFICATION', [
        {path: ['model', 'inputImagery', 'images', '*', 'bands'], reason: 'Band schema copied off the image when it was selected'},
        {path: ['model', 'inputImagery', 'images', '*', 'bandSetSpecs'], reason: 'Derived-band configuration'},
        // Exact, so it absorbs only the data-set object itself: a training data set names how its points
        // were acquired, and EE_TABLE collides with the AOI table reference vocabulary even though the
        // table was read into referenceData when the set was created. Anything nested inside a data set is
        // still inventoried.
        {path: ['model', 'trainingData', 'dataSets', '*'], exact: true, reason: 'A training data set records how its points were acquired; its type is not a reference type'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'recipeIdToSample'], reason: 'Panel selection: the sampling already ran and its points are in referenceData'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'assetToSample'], reason: 'Panel selection: the sampling already ran and its points are in referenceData'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'eeTable'], reason: 'Panel selection: the table was already read into referenceData'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'referenceData'], reason: 'Materialized training points'},
        {path: ['model', 'auxiliaryImagery'], reason: 'Enumerated covariates; their Earth Engine assets are fixed in lib/js/ee/src/classification/classification.js'}
    ]],
    ['REGRESSION', [
        // Exact, so it absorbs only the data-set record itself. A training data set names how its points were
        // acquired, and EE_TABLE collides with the AOI table reference vocabulary even though that table was
        // read into referenceData when the set was created. Anything nested inside is still inventoried.
        {path: ['model', 'trainingData', 'dataSets', '*'], exact: true, reason: 'A training data set records how its points were acquired; its type is not a reference type'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'eeTable'], reason: 'Panel selection: the table was already read into referenceData'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'recipeIdToSample'], reason: 'Panel selection: the sampling already ran and its points are in referenceData'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'assetToSample'], reason: 'Panel selection: the sampling already ran and its points are in referenceData'},
        {path: ['model', 'trainingData', 'dataSets', '*', 'referenceData'], reason: 'Materialized reference points'},
        {path: ['model', 'auxiliaryImagery'], reason: 'Enumerated covariates; their Earth Engine assets are fixed in lib/js/ee/src/regression/regression.js'}
    ]],
    ['SAMPLING_DESIGN', [
        // Exact, so it absorbs only the stratification record itself. The record's `type` is which KIND of
        // stratification was chosen - 'RECIPE' or 'ASSET' - which collides with the AOI reference vocabulary
        // even though the ids it selects are bare fields inside it, not a reference object. Anything nested
        // inside is still inventoried.
        {path: ['model', 'stratification'], exact: true, reason: 'A stratification record names which kind of source was chosen; its type is not a reference type'}
    ]],
    ['ASSET_MOSAIC', [
        {path: ['model', 'assetDetails', 'type'], reason: 'Earth Engine asset kind, not a reference'},
        {path: ['model', 'assetDetails', 'bands'], reason: 'Band schema copied off the asset when it was selected'},
        {path: ['model', 'assetDetails', 'visualizations'], reason: 'Source presets copied off the asset'},
        {path: ['model', 'assetDetails', 'metadata'], reason: 'Asset metadata copied off the asset'}
    ]]
])

export const nonEdgeFields = type =>
    NON_EDGES.get(type) || []
