import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {stratifiedGridError, stratifiedMinDistanceError, unstratifiedSystematicGridError, unsupportedArrangementCrsError} from '#gee/jobs/task/samplingDesign/samplingGridValidation'
import {EASE_GRID_2_GLOBAL_WKT} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {assertMatches} from '#sepal/testSupport/assert'

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
        assert.equal(stratifiedGridError(arrangement()), null)
        assert.equal(stratifiedGridError(arrangement({stratificationCrs: 'EPSG:6933'})), null)
        assert.equal(stratifiedGridError(arrangement({stratificationCrs: 'EPSG:4326'})), null)
    })

    it('accepts every curated Arrangement CRS', () => {
        assert.equal(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:6931'})), null)
        assert.equal(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:6932'})), null)
    })

    it('rejects an Arrangement CRS outside the curated catalog', () => {
        const error = stratifiedGridError(arrangement({arrangementCrs: 'EPSG:4326'}))
        assert.equal(key(error), UNSUPPORTED_ARRANGEMENT)
        assert.equal(
            error.userMessage.args.supported,
            'EPSG:6933 - EASE-Grid 2.0 Global, EPSG:6931 - EASE-Grid 2.0 North, EPSG:6932 - EASE-Grid 2.0 South'
        )
        // The full WKT must never be dumped into user-facing text.
        assert.ok(!error.message.includes('PROJCS'))
        assert.equal(
            key(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:3410'}))),
            UNSUPPORTED_ARRANGEMENT
        )
    })

    it('rejects the raw WKT as a stored Arrangement value; recipes store the option id', () => {
        assert.equal(
            key(stratifiedGridError(arrangement({arrangementCrs: EASE_GRID_2_GLOBAL_WKT}))),
            UNSUPPORTED_ARRANGEMENT
        )
    })

    it('rejects a blank Stratification CRS', () => {
        assert.equal(
            key(stratifiedGridError(arrangement({stratificationCrs: ''}))),
            INVALID_STRATIFICATION_CRS
        )
        assert.equal(
            key(stratifiedGridError(arrangement({stratificationCrs: '   '}))),
            INVALID_STRATIFICATION_CRS
        )
        // Built directly: a destructuring default would swallow an explicit undefined.
        assert.equal(
            key(stratifiedGridError({stratificationGrid: {scale: 10}, arrangementGrid: {crs: 'EPSG:6933'}})),
            INVALID_STRATIFICATION_CRS
        )
    })

    it('never dumps the WKT when reporting a Stratification CRS problem', () => {
        assert.ok(
            !stratifiedGridError(arrangement({stratificationCrs: ''})).message.includes('PROJCS')
        )
    })

    it('rejects a missing Stratification Scale', () => {
        assert.equal(
            key(stratifiedGridError({stratificationGrid: {crs: 'EPSG:32636'}, arrangementGrid: {crs: 'EPSG:6933'}})),
            INVALID_SCALE
        )
        assert.equal(key(stratifiedGridError(arrangement({scale: ''}))), INVALID_SCALE)
    })

    it('rejects a non-positive or non-finite Stratification Scale', () => {
        assert.equal(key(stratifiedGridError(arrangement({scale: 0}))), INVALID_SCALE)
        assert.equal(key(stratifiedGridError(arrangement({scale: -5}))), INVALID_SCALE)
        assert.equal(key(stratifiedGridError(arrangement({scale: 'abc'}))), INVALID_SCALE)
    })

    it('reports the Arrangement CRS before the Stratification problems, so one bad grid raises one error', () => {
        assert.equal(
            key(stratifiedGridError(arrangement({arrangementCrs: 'EPSG:4326', stratificationCrs: '', scale: 0}))),
            UNSUPPORTED_ARRANGEMENT
        )
    })
})

describe('unstratifiedSystematicGridError', () => {
    it('accepts a curated Arrangement CRS', () => {
        assert.equal(
            unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6933'}}),
            null
        )
        assert.equal(
            unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6931'}}),
            null
        )
        assert.equal(
            unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6932'}}),
            null
        )
    })

    it('rejects an Arrangement CRS outside the curated catalog', () => {
        assert.equal(
            key(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:3410'}})),
            UNSUPPORTED_ARRANGEMENT
        )
        assert.equal(
            key(unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:4326'}})),
            UNSUPPORTED_ARRANGEMENT
        )
    })

    it('does not require a Stratification grid', () => {
        assert.equal(
            unstratifiedSystematicGridError({arrangementGrid: {crs: 'EPSG:6933'}}),
            null
        )
    })
})

describe('unsupportedArrangementCrsError', () => {
    it('accepts the curated catalog and rejects everything else', () => {
        assert.equal(unsupportedArrangementCrsError('EPSG:6933'), null)
        assert.equal(key(unsupportedArrangementCrsError('EPSG:32636')), UNSUPPORTED_ARRANGEMENT)
    })
})

describe('stratifiedMinDistanceError', () => {
    const MIN_DISTANCE_BELOW = 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid'
    const INVALID_MIN_DISTANCE = 'tasks.samplingDesign.systematic.grid.invalidMinDistance'

    it('accepts an unset distance (it resolves to the floor)', () => {
        assert.equal(stratifiedMinDistanceError(arrangement({minDistance: null})), null)
        assert.equal(stratifiedMinDistanceError(arrangement({minDistance: ''})), null)
    })

    it('accepts a distance at or above twice the Stratification pixel size', () => {
        assert.equal(
            stratifiedMinDistanceError(arrangement({scale: 10, minDistance: 20})),
            null
        )
        assert.equal(
            stratifiedMinDistanceError(arrangement({scale: 10, minDistance: 1000})),
            null
        )
    })

    it('rejects a distance below the Stratification floor, reporting the real constraint', () => {
        const error = stratifiedMinDistanceError(arrangement({scale: 30, minDistance: 20}))
        assert.equal(key(error), MIN_DISTANCE_BELOW)
        assertMatches(error.userMessage.args, {value: 20, pixelSize: 30, minimum: 60})
    })

    it('rejects a non-numeric distance as malformed rather than rendering NaN', () => {
        assert.equal(
            key(stratifiedMinDistanceError(arrangement({minDistance: 'abc'}))),
            INVALID_MIN_DISTANCE
        )
    })
})

// The grid is a CRS and a metre Scale, so the Scale is what the floor is taken from.
describe('the minimum-distance floor', () => {
    it('is two Scale pixels', () => {
        const error = stratifiedMinDistanceError({
            minDistance: 20,
            stratificationGrid: {crs: 'EPSG:32636', scale: 30}
        })
        assertMatches(error.userMessage.args, {value: 20, pixelSize: 30, minimum: 60})
    })
})
