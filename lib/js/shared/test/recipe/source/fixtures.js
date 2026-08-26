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
//   MASKING inputs          recipe/masking/panels/inputImage/inputImage.jsx valuesToModel

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

// MASKING keeps one selection per input panel. Both are written by the same form
// (recipe/masking/panels/inputImage/inputImage.jsx valuesToModel), which emits exactly
// {type, id, bands, visualizations}: `type` is the panel section, and the bands and visualizations are the
// description loaded off the source when the form was dirty (imageForm.jsx onLoaded).
//
// The bands and visualizations are a snapshot, ignored by the dependency extractor and by the completeness
// audit: the selection itself is a reference, so the audit stops at it and never reaches them. They are not
// ignored by the product - recipe/masking/bands.js and visualizations.js read them as the wrapper's output
// schema and presets, which is the stale-snapshot defect the source foundation exists to remove. They are
// here because a saved recipe has them.
//
// Two fields the writer does NOT emit, so neither appears here: `metadata` is a declared form field that
// valuesToModel drops, and `errorBand` is read by recipe/masking/maskingRecipe.js hasError but written by
// no current writer. A recipe saved by an older version may still carry them.
export const maskingRecipeImage = () => ({
    type: 'RECIPE_REF',
    id: 'classification-1',
    bands: ['class'],
    visualizations: [
        {type: 'categorical', bands: ['class'], values: [1], labels: ['Forest'], palette: ['#00ff00']}
    ]
})

export const maskingAssetImage = () => ({
    type: 'ASSET',
    id: 'projects/p/assets/cloud-mask',
    bands: ['mask'],
    visualizations: [{type: 'continuous', bands: ['mask'], min: [0], max: [1]}]
})

export const maskingRecipe = ({
    imageToMask = maskingRecipeImage(),
    imageMask = maskingAssetImage()
} = {}) => ({
    id: 'masking-1',
    type: 'MASKING',
    model: {imageToMask, imageMask}
})

// ---------------------------------------------------------------------------------------------------------
// The rest of the production catalogue.
//
// Writers cited (paths relative to modules/gui/src/app/home/body/process):
//   MOSAIC                  recipe/opticalMosaic/opticalMosaicRecipe.js  defaultModel
//   RADAR_MOSAIC            recipe/radarMosaic/radarMosaicRecipe.js      defaultModel
//   PLANET_MOSAIC           recipe/planetMosaic/planetMosaicRecipe.js    defaultModel
//   TIME_SERIES/PHENOLOGY   recipe/ccdc/panels/sources/sources.jsx       valuesToModel (shared sources model)
//   CHANGE_ALERTS           recipe/changeAlerts/changeAlertsRecipe.js    defaultModel
//   PYEO_ALERTS             recipe/pyeoAlerts/pyeoAlertsRecipe.js        defaultModel
//   BAYTS_*                 recipe/baytsAlerts/baytsAlertsRecipe.js      defaultModel
//   input imagery           panels/inputImagery/inputImage.jsx           valuesToModel
//   CLASS_CHANGE            recipe/classChange/panels/inputImage/inputImage.jsx valuesToModel
//   INDEX_CHANGE            recipe/indexChange/panels/inputImage/inputImage.jsx valuesToModel
//   SAMPLING_DESIGN         recipe/samplingDesign/panels/stratification/stratificationModel.js valuesToModel

// panels/inputImagery/inputImage.jsx writes `id` AND keeps `recipe`/`asset` as separate bare-id copies. They
// are not cleared when the section changes, so a RECIPE_REF image can carry a stale asset id from a previous
// selection. Only `type` and `id` decide the reference; a definition reading `recipe` or `asset` would resolve
// the wrong thing on exactly those models.
export const inputImage = ({imageId, type, id, staleRecipe, staleAsset}) => ({
    imageId,
    type,
    id,
    recipe: type === 'RECIPE_REF' ? id : staleRecipe,
    asset: type === 'ASSET' ? id : staleAsset,
    bands: ['red', 'nir'],
    visualizations: [],
    includedBands: [{band: 'red'}, {band: 'nir'}]
})

const inputImagery = () => ({
    images: [
        inputImage({imageId: 'image-1', type: 'RECIPE_REF', id: 'mosaic-1', staleAsset: 'projects/p/assets/previously-selected'}),
        inputImage({imageId: 'image-2', type: 'ASSET', id: 'projects/p/assets/covariates'})
    ]
})

export const opticalMosaicRecipe = ({aoi = countryAoi()} = {}) => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        aoi,
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2020-07-02'},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_8']}},
        sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
        compositeOptions: {corrections: ['SR'], filters: []}
    }
})

export const radarMosaicRecipe = ({aoi = recipeAoi()} = {}) => ({
    id: 'radar-mosaic-1',
    type: 'RADAR_MOSAIC',
    model: {
        aoi,
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        options: {orbits: ['ASCENDING'], outlierRemoval: 'MODERATE'}
    }
})

// planet/mosaic.js falls back to three hardcoded NICFI collections when `sources` is absent. Those are fixed
// in the implementation, not selections, so only a persisted `assets` list is a reference.
export const planetMosaicRecipe = ({aoi = polygonAoi(), assets = ['projects/p/assets/basemaps-a', 'projects/p/assets/basemaps-b']} = {}) => ({
    id: 'planet-mosaic-1',
    type: 'PLANET_MOSAIC',
    model: {
        aoi,
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01', targetDate: '2020-07-01'},
        sources: {source: 'BASEMAPS', assets},
        options: {histogramMatching: 'DISABLED', cloudThreshold: 0.15}
    }
})

// TIME_SERIES and PHENOLOGY hand `model.sources` to the same collection builder as CCDC
// (lib/js/ee/src/timeSeries/collection.js), so they carry the same optional classification and Planet assets.
// Planet-backed, because `sources.assets` holds bare id strings that the structural audit cannot see: an
// implementation that omitted them would audit clean, so only an explicit edge assertion catches it.
export const timeSeriesRecipe = ({
    aoi = assetAoi(),
    classification = 'classification-1',
    assets = ['projects/p/assets/basemaps-a', 'projects/p/assets/basemaps-b']
} = {}) => ({
    id: 'time-series-1',
    type: 'TIME_SERIES',
    model: {
        aoi,
        dates: {startDate: '2018-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'PLANET', dataSets: {PLANET: ['BASEMAPS']}, assets, classification, breakpointBands: []},
        options: {corrections: []}
    }
})

export const phenologyRecipe = ({
    aoi = countryAoi(),
    classification = null,
    assets = ['projects/p/assets/basemaps-c']
} = {}) => ({
    id: 'phenology-1',
    type: 'PHENOLOGY',
    model: {
        aoi,
        dates: {fromYear: 2018, toYear: 2020},
        sources: {dataSetType: 'PLANET', dataSets: {PLANET: ['BASEMAPS']}, assets, classification, band: 'ndvi'},
        options: {}
    }
})

// The alert recipes select one reference that is a recipe OR an asset. changeAlerts.js and baytsAlerts.js both
// call imageFactory(model.reference) unconditionally, so the asset case is as much a dependency as the recipe.
// referenceSync.jsx assigns the referenced CCDC recipe's COMPLETE `model.sources` when a recipe is selected,
// or parses it out of a selected asset's `recipe_sources` property. So Change Alerts carries the same optional
// classification and Planet asset list CCDC does, and changeAlerts.js hands it to the same collection owner.
export const changeAlertsRecipe = ({
    reference = {type: 'RECIPE_REF', id: 'ccdc-1', dateFormat: 0},
    classification = 'classification-1',
    assets = ['projects/p/assets/basemaps-a', 'projects/p/assets/basemaps-b']
} = {}) => ({
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference,
        date: {monitoringEnd: '2021-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
        sources: {dataSetType: 'PLANET', dataSets: {PLANET: ['BASEMAPS']}, assets, classification, band: 'ndfi'},
        options: {corrections: ['SR']},
        changeAlertsOptions: {minConfidence: 3, minNumberOfChanges: 1}
    }
})

export const pyeoAlertsRecipe = ({aoi = countryAoi(), classification = 'classification-1'} = {}) => ({
    id: 'pyeo-alerts-1',
    type: 'PYEO_ALERTS',
    model: {
        aoi,
        dates: {monitoringStart: '2020-01-01', monitoringEnd: '2021-01-01'},
        sources: {classification, dataSets: {}, cloudPercentageThreshold: 75, changeFromClasses: [], changeToClasses: []},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {}
    }
})

export const baytsHistoricalRecipe = ({aoi = recipeAoi()} = {}) => ({
    id: 'bayts-historical-1',
    type: 'BAYTS_HISTORICAL',
    model: {
        aoi,
        dates: {fromDate: '2019-01-01', toDate: '2020-01-01'},
        options: {orbits: ['ASCENDING']}
    }
})

// Two asset references in one submodel, persisted in two different shapes by the same writer
// (recipe/baytsAlerts/panels/options/options.jsx valuesToModel):
//
//   previousAlertsAsset  a canonical selection, {type: 'ASSET', id}, or undefined when blank. baytsAlerts.js
//                        toAlerts$ hands it straight to imageFactory, so it resolves exactly like any other
//                        selected source.
//   wetlandMaskAsset     a bare id string, spread through unchanged. bayts.js toBayts reads it as
//                        ee.Image(args.wetlandMaskAsset || 0), so a persisted value is a real dependency
//                        while a blank one falls back to a constant image and is not a reference at all. It
//                        carries a default id from baytsAlertsRecipe.js defaultModel.
//
// One submodel therefore needs both selection extraction and bare-id extraction; neither shape can stand in
// for the other.
export const baytsAlertsRecipe = ({
    reference = {type: 'RECIPE_REF', id: 'bayts-historical-1'},
    previousAlertsAsset = {type: 'ASSET', id: 'projects/p/assets/previous-alerts'},
    wetlandMaskAsset = 'users/wiell/SepalResources/wetlandMask_v1'
} = {}) => ({
    id: 'bayts-alerts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference,
        date: {monitoringEnd: '2021-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
        options: {orbits: ['ASCENDING']},
        baytsAlertsOptions: {previousAlertsAsset, wetlandMaskAsset, sensitivity: 1, maxDays: 90}
    }
})

export const stackRecipe = () => ({
    id: 'stack-1',
    type: 'STACK',
    model: {
        inputImagery: inputImagery(),
        bandNames: {bandNames: [{imageId: 'image-1', bands: [{originalName: 'red', outputName: 'red_1'}]}]}
    }
})

export const bandMathRecipe = () => ({
    id: 'band-math-1',
    type: 'BAND_MATH',
    model: {
        inputImagery: inputImagery(),
        calculations: {calculations: []},
        outputBands: {outputImages: []}
    }
})

export const remappingRecipe = () => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: inputImagery(),
        legend: {entries: [{value: 1, color: '#00ff00', label: 'Forest'}]}
    }
})

// The three dataset types regression/panels/trainingData/trainingDataSet.jsx can write, each with the fields
// its own section fills in. Only RECIPE is loaded at execution (regression.js filters on it); an EE_TABLE was
// already read into referenceData, and a SAMPLE_IMAGE records what it sampled and when. The EE_TABLE record
// collides with the AOI table vocabulary on `type`, which is what the exact non-edge classification is for.
export const regressionRecipe = () => ({
    id: 'regression-1',
    type: 'REGRESSION',
    model: {
        inputImagery: inputImagery(),
        trainingData: {
            dataSets: [
                {
                    dataSetId: 'ds-1',
                    name: 'Plots',
                    type: 'EE_TABLE',
                    eeTable: 'projects/p/assets/plots',
                    valueColumn: 'biomass',
                    referenceData: [{x: 1, y: 2, value: 3}]
                },
                {
                    dataSetId: 'ds-2',
                    name: 'Sampled',
                    type: 'SAMPLE_IMAGE',
                    typeToSample: 'RECIPE',
                    recipeIdToSample: 'regression-9',
                    assetToSample: 'projects/p/assets/sampled-regression',
                    sampleCount: 100,
                    sampleScale: 30,
                    valueColumn: 'biomass',
                    referenceData: [{x: 3, y: 4, value: 5}]
                },
                {dataSetId: 'ds-3', name: 'Reused', type: 'RECIPE', recipe: 'regression-0'}
            ]
        },
        auxiliaryImagery: ['LATITUDE', 'TERRAIN'],
        classifier: {type: 'RANDOM_FOREST'},
        scale: 30
    }
})

// Clustering has no training data at all: unsupervisedClassification.js reads input imagery and sampling only.
export const unsupervisedClassificationRecipe = () => ({
    id: 'unsupervised-1',
    type: 'UNSUPERVISED_CLASSIFICATION',
    model: {
        inputImagery: inputImagery(),
        sampling: {numberOfSamples: 1000, sampleScale: 30},
        auxiliaryImagery: [],
        clusterer: {type: 'WEKA_KMEANS'},
        scale: 30
    }
})

const changeImage = ({type, id}) => ({
    type,
    id,
    bands: ['class'],
    band: 'class',
    legendEntries: [{value: 1, color: '#00ff00', label: 'Forest'}]
})

export const classChangeRecipe = () => ({
    id: 'class-change-1',
    type: 'CLASS_CHANGE',
    model: {
        fromImage: changeImage({type: 'RECIPE_REF', id: 'classification-1'}),
        toImage: changeImage({type: 'ASSET', id: 'projects/p/assets/classification-2020'}),
        options: {minConfidence: 0}
    }
})

export const indexChangeRecipe = () => ({
    id: 'index-change-1',
    type: 'INDEX_CHANGE',
    model: {
        fromImage: changeImage({type: 'ASSET', id: 'projects/p/assets/ndvi-2018'}),
        toImage: changeImage({type: 'RECIPE_REF', id: 'mosaic-1'}),
        legend: {entries: []},
        options: {minConfidence: 2.5}
    }
})

// stratificationModel.js valuesToModel writes `assetId` AND `recipeId` unconditionally, so both survive a
// section switch and a persisted model routinely carries the one it is not using. `type` alone decides which
// is read (lib/js/ee/src/samplingDesign/stratificationImage.js), and `skip` short-circuits both.
export const samplingDesignRecipe = ({aoi = countryAoi(), stratification = {}} = {}) => ({
    id: 'sampling-design-1',
    type: 'SAMPLING_DESIGN',
    model: {
        aoi,
        stratification: {
            skip: false,
            type: 'RECIPE',
            recipeId: 'classification-1',
            assetId: 'projects/p/assets/stale-stratification',
            band: 'class',
            scale: 30,
            crs: 'EPSG:4326',
            strata: [],
            ...stratification
        },
        sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1}
    }
})
