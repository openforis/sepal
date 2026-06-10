// Earliest GEE ImageCollection start date for each user-facing dataset code.
// Source: Google Earth Engine catalog metadata for the collection IDs in
// lib/js/ee/src/optical/dataSetSpecs.json. When GEE refreshes a collection's
// availability, update here and re-run lib/js/recipes tests.
//
// LANDSAT_TM / LANDSAT_TM_T2 are user-facing aggregates that expand at
// runtime to Landsat 4 + Landsat 5 (see lib/js/ee/src/optical/mosaic.js).
// The aggregate's floor uses the earliest constellation start.
//
// SENTINEL_2 floors on the TOA collection (COPERNICUS/S2_HARMONIZED). The
// SR_HARMONIZED collection has a documented later start for global coverage;
// the SR coverage gap is described in knowledge.js, not modelled here. This
// rule only catches windows that end before any coverage exists at all.

const COLLECTION_AVAILABILITY = {
    LANDSAT_TM: '1982-08-22',
    LANDSAT_TM_T2: '1982-08-22',
    LANDSAT_7: '1999-05-28',
    LANDSAT_7_T2: '1999-05-28',
    LANDSAT_8: '2013-03-18',
    LANDSAT_8_T2: '2013-03-18',
    LANDSAT_9: '2021-10-31',
    LANDSAT_9_T2: '2021-10-31',
    SENTINEL_2: '2015-06-27'
}

export {COLLECTION_AVAILABILITY}
