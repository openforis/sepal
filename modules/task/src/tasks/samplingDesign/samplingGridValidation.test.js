import {EASE_GRID_2_GLOBAL_WKT} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {stratifiedGridError, stratifiedMinDistanceError, unstratifiedSystematicGridError, unsupportedArrangementCrsError} from './samplingGridValidation.js'

const key = error => error?.userMessage?.key
const UNSUPPORTED_ARRANGEMENT = 'tasks.samplingDesign.grid.unsupportedArrangementCrs'
const INVALID_STRATIFICATION_CRS = 'tasks.samplingDesign.grid.invalidStratificationCrs'
const INVALID_SCALE = 'tasks.samplingDesign.grid.invalidScale'

// The validators read the two named grids off the effective arrangement. The Arrangement CRS must be curated;
// the Stratification CRS only has to be present, because it names the projection the categorical source is
// interpreted in and is not restricted to the equal-area catalog.
const arrangement = ({arrangementCrs = 'EPSG:6933', stratificationCrs = 'EPSG:32636', scale = 10, ...rest} = {}) => ({
    stratificationGrid: {crs: stratificationCrs, scale},
    arrangementGrid: {crs: arrangementCrs},
    ...rest
})

describe('stratifiedGridError (task-boundary two-grid contract)', () => {
    it('accepts a curated Arrangement CRS with any non-blank Stratification CRS and a valid Scale', () => {
        expect(stratifiedGridError(arrangement())).toBeNull()
        expect(stratifiedGridError(arrangement({stratificationCrs: 'EPSG:6933'}))).toBeNull()
        expect(stratifiedGridError(arrangement({stratificationCrs: 'EPSG:4326'}))).toBeNull()
    })

    it('accepts every curated Arrangement CRS', () => {
        expect(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:6931'}))).toBeNull()
        expect(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:6932'}))).toBeNull()
    })

    it('rejects an Arrangement CRS outside the curated catalog', () => {
        const error = stratifiedGridError(arrangement({arrangementCrs: 'EPSG:4326'}))
        expect(key(error)).toBe(UNSUPPORTED_ARRANGEMENT)
        expect(error.userMessage.args.supported)
            .toBe('EPSG:6933 - EASE-Grid 2.0 Global, EPSG:6931 - EASE-Grid 2.0 North, EPSG:6932 - EASE-Grid 2.0 South')
        // The full WKT must never be dumped into user-facing text.
        expect(error.message).not.toContain('PROJCS')
        expect(key(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:3410'})))).toBe(UNSUPPORTED_ARRANGEMENT)
    })

    it('rejects the raw WKT as a stored Arrangement value; recipes store the option id', () => {
        expect(key(stratifiedGridError(arrangement({arrangementCrs: EASE_GRID_2_GLOBAL_WKT})))).toBe(UNSUPPORTED_ARRANGEMENT)
    })

    it('rejects a blank Stratification CRS', () => {
        expect(key(stratifiedGridError(arrangement({stratificationCrs: ''})))).toBe(INVALID_STRATIFICATION_CRS)
        expect(key(stratifiedGridError(arrangement({stratificationCrs: '   '})))).toBe(INVALID_STRATIFICATION_CRS)
        // Built directly: a destructuring default would swallow an explicit undefined.
        expect(key(stratifiedGridError({stratificationGrid: {scale: 10}, arrangementGrid: {crs: 'EPSG:6933'}})))
            .toBe(INVALID_STRATIFICATION_CRS)
    })

    it('never dumps the WKT when reporting a Stratification CRS problem', () => {
        expect(stratifiedGridError(arrangement({stratificationCrs: ''})).message).not.toContain('PROJCS')
    })

    it('rejects a missing Stratification Scale', () => {
        expect(key(stratifiedGridError({stratificationGrid: {crs: 'EPSG:32636'}, arrangementGrid: {crs: 'EPSG:6933'}})))
            .toBe(INVALID_SCALE)
        expect(key(stratifiedGridError(arrangement({scale: ''})))).toBe(INVALID_SCALE)
    })

    it('rejects a non-positive or non-finite Stratification Scale', () => {
        expect(key(stratifiedGridError(arrangement({scale: 0})))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError(arrangement({scale: -5})))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError(arrangement({scale: 'abc'})))).toBe(INVALID_SCALE)
    })

    it('reports the Arrangement CRS before the Stratification problems, so one bad grid raises one error', () => {
        expect(key(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:4326', stratificationCrs: '', scale: 0}))))
            .toBe(UNSUPPORTED_ARRANGEMENT)
    })
})

describe('unstratifiedSystematicGridError', () => {
    it('accepts a curated Arrangement CRS', () => {
        expect(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6933'}})).toBeNull()
        expect(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6931'}})).toBeNull()
        expect(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6932'}})).toBeNull()
    })

    it('rejects an Arrangement CRS outside the curated catalog', () => {
        expect(key(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:3410'}}))).toBe(UNSUPPORTED_ARRANGEMENT)
        expect(key(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:4326'}}))).toBe(UNSUPPORTED_ARRANGEMENT)
    })

    it('does not require a Stratification grid', () => {
        expect(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6933'}})).toBeNull()
    })
})

describe('unsupportedArrangementCrsError', () => {
    it('accepts the curated catalog and rejects everything else', () => {
        expect(unsupportedArrangementCrsError('EPSG:6933')).toBeNull()
        expect(key(unsupportedArrangementCrsError('EPSG:32636'))).toBe(UNSUPPORTED_ARRANGEMENT)
    })
})

describe('stratifiedMinDistanceError', () => {
    const MIN_DISTANCE_BELOW = 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid'
    const INVALID_MIN_DISTANCE = 'tasks.samplingDesign.systematic.grid.invalidMinDistance'

    it('accepts an unset distance (it resolves to the floor)', () => {
        expect(stratifiedMinDistanceError(arrangement({minDistance: null}))).toBeNull()
        expect(stratifiedMinDistanceError(arrangement({minDistance: ''}))).toBeNull()
    })

    it('accepts a distance at or above twice the Stratification pixel size', () => {
        expect(stratifiedMinDistanceError(arrangement({scale: 10, minDistance: 20}))).toBeNull()
        expect(stratifiedMinDistanceError(arrangement({scale: 10, minDistance: 1000}))).toBeNull()
    })

    it('rejects a distance below the Stratification floor, reporting the real constraint', () => {
        const error = stratifiedMinDistanceError(arrangement({scale: 30, minDistance: 20}))
        expect(key(error)).toBe(MIN_DISTANCE_BELOW)
        expect(error.userMessage.args).toMatchObject({value: 20, pixelSize: 30, minimum: 60})
    })

    it('rejects a non-numeric distance as malformed rather than rendering NaN', () => {
        expect(key(stratifiedMinDistanceError(arrangement({minDistance: 'abc'})))).toBe(INVALID_MIN_DISTANCE)
    })
})

// The grid is a CRS and a metre Scale, so the Scale is what the floor is taken from.
describe('the minimum-distance floor', () => {
    it('is two Scale pixels', () => {
        const error = stratifiedMinDistanceError({
            minDistance: 20,
            stratificationGrid: {crs: 'EPSG:32636', scale: 30}
        })
        expect(error.userMessage.args).toMatchObject({value: 20, pixelSize: 30, minimum: 60})
    })
})
