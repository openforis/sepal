// The radar data sets Sources offer, by the identifier they save.
export const RADAR_DATA_SETS = ['SENTINEL_1']

// The Earth Engine collection execution reads for each (lib/js/ee/src/radar/collection.js), whatever the correction.
export const RADAR_COLLECTIONS = {
    SENTINEL_1: 'COPERNICUS/S1_GRD_FLOAT'
}

// The days it holds imagery for, as for optical collections (../optical/collectionDates.js). The catalogue lists no
// COPERNICUS/S1_GRD_FLOAT: it holds COPERNICUS/S1_GRD's scenes in linear units, so it is given that collection's first
// day, 2014-10-03, and it is still acquiring.
export const RADAR_COLLECTION_DATES = {
    'COPERNICUS/S1_GRD_FLOAT': {fromDate: '2014-10-03'}
}
