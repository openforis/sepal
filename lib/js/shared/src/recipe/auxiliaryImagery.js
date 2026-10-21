// The bands each auxiliary covariate adds to the image Classification, Regression and Unsupervised Classification
// sample and classify (model.auxiliaryImagery), as execution builds them (lib/js/ee/src/auxiliaryImagery.js) and the
// training data they reuse is judged by (trainingData.js).

export const WATER_MEASURES = ['occurrence', 'change_abs', 'change_norm', 'seasonality', 'max_extent']

// In the order of JRC Global Surface Water's transition values: the index of each is the value it masks.
export const WATER_TRANSITIONS = [
    'no_change',
    'permanent',
    'new_permanent',
    'lost_permanent',
    'seasonal',
    'new_seasonal',
    'lost_seasonal',
    'seasonal_to_permanent',
    'permanent_to_seasonal',
    'ephemeral_permanent',
    'ephemeral_seasonal'
]

export const waterBand = name => `water_${name}`

export const AUXILIARY_BANDS = {
    LATITUDE: ['latitude'],
    TERRAIN: ['elevation', 'slope', 'aspect', 'eastness', 'northness'],
    WATER: [...WATER_MEASURES, ...WATER_TRANSITIONS].map(waterBand)
}

// The bands the configured covariates add, in configured order.
export const auxiliaryBands = (auxiliaryImagery = []) =>
    auxiliaryImagery.flatMap(type => AUXILIARY_BANDS[type] || [])
