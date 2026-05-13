// Complete default radarMosaic recipe model — a populated baseline the LLM
// can tweak rather than build from scratch.
//
// Sourced from the GUI's defaultModel in
// modules/gui/src/app/home/body/process/recipe/radarMosaic/radarMosaicRecipe.js,
// plus dates that compute to the current year (the GUI also computes these
// dynamically). AOI is intentionally excluded — there is no sensible default;
// the user must provide it.

const moment = require('moment')

const DATE_FORMAT = 'YYYY-MM-DD'

const getDefaults = () => ({
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    options: {
        orbits: ['ASCENDING', 'DESCENDING'],
        orbitNumbers: 'ALL',
        geometricCorrection: 'TERRAIN',
        spatialSpeckleFilter: 'LEE_SIGMA',
        kernelSize: 9,
        sigma: 0.9,
        strongScatterers: 'RETAIN',
        strongScattererValues: [0, -5],
        snicSize: 5,
        snicCompactness: 0.15,
        multitemporalSpeckleFilter: 'NONE',
        numberOfImages: 10,
        outlierRemoval: 'MODERATE',
        mask: ['SIDES', 'FIRST_LAST'],
        minAngle: 30.88,
        maxAngle: 45.35,
        minObservations: 1
    }
})

module.exports = {getDefaults}
