// The optical data sets Sources offer, by the identifier they save: LANDSAT_TM and LANDSAT_TM_T2 stand for Landsat 4 and
// 5, which execution reads as both (opticalBands.js).
export const OPTICAL_DATA_SETS = [
    'LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM',
    'LANDSAT_8_T2', 'LANDSAT_9_T2', 'LANDSAT_7_T2', 'LANDSAT_TM_T2',
    'SENTINEL_2'
]

// The days each Earth Engine collection execution reads for them (dataSetSpecs.js, by correction) holds imagery for: its
// first acquisition day and, for one no longer acquiring, its last (UTC), as the Earth Engine catalogue states them
// (developers.google.com/earth-engine/datasets/catalog, its STAC records; read 2026-11-11). These are the collections'
// dates, not their missions': Landsat 5's top-of-atmosphere Tier 1 ends in November 2011, its surface reflectance in May
// 2012. Days possible, not scenes over an area or enough of them. Judged by ../dataSetAvailability.js.
export const OPTICAL_COLLECTION_DATES = {
    'LANDSAT/LT04/C02/T1_TOA': {fromDate: '1982-08-22', toDate: '1993-12-14'},
    'LANDSAT/LT04/C02/T2_TOA': {fromDate: '1982-08-22', toDate: '1993-11-18'},
    'LANDSAT/LT04/C02/T1_L2': {fromDate: '1982-08-22', toDate: '1993-06-24'},
    'LANDSAT/LT04/C02/T2_L2': {fromDate: '1982-08-22', toDate: '1993-11-18'},
    'LANDSAT/LT05/C02/T1_TOA': {fromDate: '1984-04-19', toDate: '2011-11-08'},
    'LANDSAT/LT05/C02/T2_TOA': {fromDate: '1984-03-06', toDate: '2001-02-06'},
    'LANDSAT/LT05/C02/T1_L2': {fromDate: '1984-03-16', toDate: '2012-05-05'},
    'LANDSAT/LT05/C02/T2_L2': {fromDate: '1984-03-05', toDate: '2011-11-16'},
    'LANDSAT/LE07/C02/T1_TOA': {fromDate: '1999-05-28', toDate: '2024-01-19'},
    'LANDSAT/LE07/C02/T2_TOA': {fromDate: '2003-12-01', toDate: '2024-01-19'},
    'LANDSAT/LE07/C02/T1_L2': {fromDate: '1999-05-28', toDate: '2024-01-19'},
    'LANDSAT/LE07/C02/T2_L2': {fromDate: '1999-05-28', toDate: '2024-01-19'},
    'LANDSAT/LC08/C02/T1_TOA': {fromDate: '2013-03-18'},
    'LANDSAT/LC08/C02/T1_L2': {fromDate: '2013-03-18'},
    'LANDSAT/LC08/C02/T2_L2': {fromDate: '2013-03-18'},
    'LANDSAT/LC09/C02/T1_TOA': {fromDate: '2021-10-31'},
    'LANDSAT/LC09/C02/T2_TOA': {fromDate: '2021-11-02'},
    'LANDSAT/LC09/C02/T1_L2': {fromDate: '2021-10-31'},
    'LANDSAT/LC09/C02/T2_L2': {fromDate: '2021-10-31'},
    'COPERNICUS/S2_HARMONIZED': {fromDate: '2015-06-27'},
    'COPERNICUS/S2_SR_HARMONIZED': {fromDate: '2017-03-28'}
}
