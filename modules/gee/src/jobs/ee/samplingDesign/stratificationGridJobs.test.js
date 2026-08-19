import {EASE_GRID_2_GLOBAL_WKT, resolveStratificationCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

// Area and anticipated proportions read the CATEGORICAL source, so they evaluate on the Stratification grid and
// must accept any projected CRS - not just the curated equal-area Arrangement catalog.
describe('area and proportions resolve the Stratification CRS', () => {
    it('translates EPSG:6933 to the WKT Earth Engine can parse', () => {
        expect(resolveStratificationCrs('EPSG:6933')).toBe(EASE_GRID_2_GLOBAL_WKT)
    })

    it('accepts a non-curated projected CRS that the Arrangement resolver would reject', () => {
        expect(resolveStratificationCrs('EPSG:32636')).toBe('EPSG:32636')
    })
})
