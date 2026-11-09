// The years each optical data set SEPAL offers may hold imagery for, by the identifier Sources save - LANDSAT_TM and
// LANDSAT_TM_T2 standing for Landsat 4 and 5, whose imagery begins with Landsat 4 in August 1982 - from `fromYear` and, for
// one that has ended, through `toYear`. Catalogue facts: a year in range says
// imagery is possible, not that a scene covers an area or that enough do. Judged by ../dataSetAvailability.js.
export const OPTICAL_DATA_SET_YEARS = {
    LANDSAT_9: {fromYear: 2021},
    LANDSAT_8: {fromYear: 2013},
    LANDSAT_7: {fromYear: 1999},
    LANDSAT_TM: {fromYear: 1982, toYear: 2012},
    LANDSAT_8_T2: {fromYear: 2013},
    LANDSAT_9_T2: {fromYear: 2021},
    LANDSAT_7_T2: {fromYear: 1999},
    LANDSAT_TM_T2: {fromYear: 1982, toYear: 2012},
    SENTINEL_2: {fromYear: 2015}
}
