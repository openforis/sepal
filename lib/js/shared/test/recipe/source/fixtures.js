// Persisted recipe models for the CCDC proving graph, used by the source-contract tests.
//
// PROVENANCE - read before trusting these shapes. No saved recipe exists anywhere in this repository: there
// is no recipe fixture under `lib/js/shared/testResources`, no recipe JSON in any module, and
// `lib/js/shared/src/recipe/migrate.js` carries only the one MOSAIC migration. Every model below is
// therefore reconstructed from the production writers that build it, cited per section, and reduced to the
// smallest shape those writers can emit. They are traceable, not recorded: a recipe saved by an older SEPAL
// version can contain shapes no current writer produces, and nothing here proves otherwise.
//
// Writers cited (paths relative to modules/gui/src/app/home/body/process):
//   aoi                     recipe/mosaic/panels/aoi/aoiModel.js         valuesToModel
//   CCDC model.sources      recipe/ccdc/panels/sources/sources.jsx       valuesToModel
//   CCDC defaults           recipe/ccdc/ccdcRecipe.js                    defaultModel
//   CCDC_SLICE model.source recipe/ccdcSlice/panels/source/source.jsx    valuesToModel
//                           recipe/ccdcSlice/sourceSync.jsx              ccdcRecipeSource/assetRecipeSource/toAssetSource
//   CLASSIFICATION imagery  panels/inputImageryWithDerived/inputImage.jsx valuesToModel
//   CLASSIFICATION training recipe/classification/panels/trainingData/trainingDataSet.jsx valuesToModel
//   CLASSIFICATION defaults recipe/classification/classificationRecipe.js getDefaultModel
//   ASSET_MOSAIC details    recipe/asset/panels/assetDetails/assetDetails.jsx (fields + onLoaded)

// aoiModel.js writes the country AOI as an EE_TABLE reference to this fixed table
// (modules/gui/src/app/home/map/aoiLayer.jsx).
export const COUNTRY_TABLE = 'users/wiell/SepalResources/gaul'

export const countryAoi = () => ({
    type: 'EE_TABLE',
    id: COUNTRY_TABLE,
    keyColumn: 'id',
    key: 'SDN',
    level: 'COUNTRY',
    buffer: 0
})

export const recipeAoi = () => ({type: 'RECIPE', id: 'aoi-recipe-1'})

export const assetAoi = () => ({type: 'ASSET', id: 'projects/p/assets/aoi-image'})

export const polygonAoi = () => ({type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]})

// CCDC with an optical time series, a country AOI and the optional Classification source.
export const ccdcRecipe = ({aoi = countryAoi(), classification = 'classification-1'} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi,
        dates: {startDate: '2000-01-01', endDate: '2020-01-01'},
        sources: {
            dataSetType: 'OPTICAL',
            dataSets: {LANDSAT: ['LANDSAT_8']},
            cloudPercentageThreshold: 75,
            assets: [],
            classification,
            breakpointBands: ['ndfi']
        },
        options: {corrections: []},
        ccdcOptions: {dateFormat: 0}
    }
})

// The Planet variant: `sources.assets` holds the ImageCollection assets that
// lib/js/ee/src/planet/collection.js merges, in model order.
export const ccdcPlanetRecipe = () => ({
    id: 'ccdc-planet-1',
    type: 'CCDC',
    model: {
        aoi: polygonAoi(),
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {
            dataSetType: 'PLANET',
            dataSets: {PLANET: ['BASEMAPS']},
            source: 'BASEMAPS',
            assets: ['projects/p/assets/basemaps-a', 'projects/p/assets/basemaps-b'],
            classification: null,
            breakpointBands: ['ndvi']
        },
        options: {},
        ccdcOptions: {dateFormat: 0}
    }
})

// CCDC_SLICE stores one selected source plus a snapshot of everything sourceSync copied off it.
export const ccdcSliceRecipeSource = () => ({
    id: 'ccdc-slice-1',
    type: 'CCDC_SLICE',
    model: {
        date: {date: '2020-06-01'},
        source: {
            type: 'RECIPE_REF',
            id: 'ccdc-1',
            bands: ['ndfi_coefs', 'tStart'],
            baseBands: [{name: 'ndfi', bandTypes: ['value', 'rmse']}],
            segmentBands: [{name: 'tStart'}],
            dateFormat: null,
            startDate: '2000-01-01',
            endDate: '2020-01-01',
            visualizations: [{type: 'continuous', bands: ['ndfi_coefs'], min: [0], max: [1]}]
        },
        options: {harmonics: 3, gapStrategy: 'INTERPOLATE'}
    }
})

export const ccdcSliceAssetSource = () => ({
    id: 'ccdc-slice-2',
    type: 'CCDC_SLICE',
    model: {
        date: {date: '2020-06-01'},
        source: {
            type: 'ASSET',
            id: 'projects/p/assets/ccdc-segments',
            bands: ['ndfi_coefs', 'tStart'],
            baseBands: [{name: 'ndfi', bandTypes: ['value']}],
            segmentBands: [{name: 'tStart'}],
            dateFormat: 0,
            startDate: '2000-01-01',
            endDate: '2020-01-01',
            visualizations: []
        },
        options: {harmonics: 3}
    }
})

// A Masking-style wrapper selected as the Slice source: sourceSync writes the outer recipe's id and marks
// what it resolved to. The reference is still the outer recipe.
export const ccdcSliceWrappedAssetRecipeSource = () => ({
    id: 'ccdc-slice-3',
    type: 'CCDC_SLICE',
    model: {
        date: {date: '2020-06-01'},
        source: {
            targetType: 'ASSET_MOSAIC',
            type: 'RECIPE_REF',
            id: 'asset-mosaic-1',
            bands: ['ndfi_coefs'],
            baseBands: [{name: 'ndfi', bandTypes: ['value']}],
            segmentBands: [],
            dateFormat: 0,
            visualizations: []
        },
        options: {}
    }
})

// Classification: ordered input imagery, one recipe-backed training data set, and one SAMPLE_CLASSIFICATION
// set whose recipe/asset selections were already sampled into referenceData by the panel.
export const classificationRecipe = () => ({
    id: 'classification-1',
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {
            images: [
                {
                    imageId: 'image-1',
                    type: 'RECIPE_REF',
                    id: 'mosaic-1',
                    bands: ['red', 'nir'],
                    bandSetSpecs: [{id: 'spec-1', type: 'IMAGE_BANDS', included: ['red', 'nir']}]
                },
                {
                    imageId: 'image-2',
                    type: 'ASSET',
                    id: 'projects/p/assets/covariates',
                    bands: ['elevation'],
                    bandSetSpecs: [{id: 'spec-2', type: 'IMAGE_BANDS', included: ['elevation']}]
                }
            ]
        },
        trainingData: {
            dataSets: [
                {dataSetId: 'ds-1', name: 'Collected', type: 'COLLECTED', referenceData: [{x: 1, y: 2, class: 1}]},
                {dataSetId: 'ds-2', name: 'Reused', type: 'RECIPE', recipe: 'classification-0'},
                {
                    dataSetId: 'ds-3',
                    name: 'Sampled',
                    type: 'SAMPLE_CLASSIFICATION',
                    typeToSample: 'RECIPE',
                    recipeIdToSample: 'classification-9',
                    assetToSample: 'projects/p/assets/sampled-classification',
                    samplesPerClass: 100,
                    sampleScale: 30,
                    referenceData: [{x: 3, y: 4, class: 2}]
                },
                {dataSetId: 'ds-4', name: 'Table', type: 'EE_TABLE', eeTable: 'projects/p/assets/plots', referenceData: []}
            ]
        },
        auxiliaryImagery: ['LATITUDE', 'TERRAIN'],
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25},
        legend: {entries: [{value: 1, color: '#00ff00', label: 'Forest'}]}
    }
})

export const assetMosaicRecipe = ({aoi = {type: 'ASSET_BOUNDS'}} = {}) => ({
    id: 'asset-mosaic-1',
    type: 'ASSET_MOSAIC',
    model: {
        aoi,
        assetDetails: {
            assetId: 'projects/p/assets/mosaic',
            type: 'Image',
            bands: ['red', 'nir'],
            visualizations: [],
            metadata: {type: 'Image', bands: ['red', 'nir'], properties: {}}
        },
        dates: {type: 'ALL_DATES'},
        composite: {type: 'MOSAIC'},
        mask: {constraintsEntries: []}
    }
})
