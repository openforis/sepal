import {EASE_GRID_2_GLOBAL_WKT} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {stratifiedGridError, stratifiedMinDistanceError, unstratifiedSystematicGridError} from './samplingGridValidation.js'

const key = error => error?.userMessage?.key
const UNSUPPORTED = 'tasks.samplingDesign.systematic.grid.unsupportedCrs'
const INVALID_TRANSFORM = 'tasks.samplingDesign.systematic.grid.invalidTransform'
const INVALID_SCALE = 'tasks.samplingDesign.systematic.grid.invalidScale'

describe('stratifiedGridError (task-boundary sampling-grid CRS/transform contract)', () => {
    it('accepts the EPSG:6933 scale grid', () => {
        expect(stratifiedGridError({crs: 'EPSG:6933', scale: 10, crsTransform: ''})).toBeNull()
    })

    it('accepts an unset CRS (resolves to the EPSG:6933 default) with a valid scale', () => {
        expect(stratifiedGridError({scale: 10})).toBeNull()
    })

    it('accepts EPSG:6933 with a north-up, square, non-zero transform (no scale)', () => {
        expect(stratifiedGridError({crs: 'EPSG:6933', crsTransform: '[10,0,0,0,-10,0]'})).toBeNull()
    })

    it('rejects EPSG:4326 with a structured unsupported-CRS error listing concise option names', () => {
        const error = stratifiedGridError({crs: 'EPSG:4326', scale: 10})
        expect(key(error)).toBe(UNSUPPORTED)
        expect(error.userMessage.args.supported)
            .toBe('EPSG:6933 - EASE-Grid 2.0 Global, EPSG:6931 - EASE-Grid 2.0 North, EPSG:6932 - EASE-Grid 2.0 South')
        // The full WKT must never be dumped into user-facing text.
        expect(error.message).not.toContain('PROJCS')
    })

    it('accepts EPSG:6933 with a valid transform', () => {
        expect(stratifiedGridError({crs: 'EPSG:6933', crsTransform: '[10,0,0,0,-10,0]'})).toBeNull()
    })

    it('accepts the EPSG:6933 option id, which resolves to the tested WKT at the EE boundary', () => {
        expect(stratifiedGridError({crs: 'EPSG:6933', scale: 10})).toBeNull()
    })

    it('rejects the raw WKT as a stored value; recipes store the option id', () => {
        expect(key(stratifiedGridError({crs: EASE_GRID_2_GLOBAL_WKT, scale: 10}))).toBe(UNSUPPORTED)
    })

    it('rejects EPSG:3410, which is no longer part of the product catalog', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:3410', scale: 10}))).toBe(UNSUPPORTED)
    })

    it('rejects EPSG:3857', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:3857', scale: 10}))).toBe(UNSUPPORTED)
    })

    it('rejects a scale AND transform together (mutually exclusive)', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: 10, crsTransform: '[10,0,0,0,-10,0]'}))).toBe(INVALID_TRANSFORM)
    })

    it('rejects a south-up transform (positive y pixel size)', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', crsTransform: '[10,0,0,0,10,0]'}))).toBe(INVALID_TRANSFORM)
    })

    it('rejects a sheared (non-axis-aligned) transform', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', crsTransform: '[10,1,0,0,-10,0]'}))).toBe(INVALID_TRANSFORM)
    })

    it('rejects a non-square transform', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', crsTransform: '[10,0,0,0,-20,0]'}))).toBe(INVALID_TRANSFORM)
    })

    it('rejects a negative x pixel size transform', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', crsTransform: '[-10,0,0,0,-10,0]'}))).toBe(INVALID_TRANSFORM)
    })

    it('rejects a malformed transform string', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', crsTransform: 'not-a-transform'}))).toBe(INVALID_TRANSFORM)
    })

    it('rejects a missing scale (no scale and no transform)', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933'}))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: '', crsTransform: ''}))).toBe(INVALID_SCALE)
    })

    it('rejects a zero, negative or non-numeric scale', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: 0}))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: -5}))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: 'abc'}))).toBe(INVALID_SCALE)
    })
})

// Unstratified systematic sampling is analytical: spacing comes from minDistance, so a missing scale is not an
// error - but the CRS must still be supported and any transform must still be valid.
describe('unstratifiedSystematicGridError', () => {
    it('accepts a supported CRS with no scale and no transform', () => {
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6933'})).toBeNull()
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6933'})).toBeNull()
        expect(unstratifiedSystematicGridError({})).toBeNull()
    })

    it('accepts an optional valid transform', () => {
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6933', crsTransform: '[10,0,0,0,-10,0]'})).toBeNull()
    })

    it('accepts every curated option id and rejects anything else', () => {
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6933'})).toBeNull()
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6931'})).toBeNull()
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6932'})).toBeNull()
        expect(key(unstratifiedSystematicGridError({crs: 'EPSG:3410'}))).toBe(UNSUPPORTED)
        expect(key(unstratifiedSystematicGridError({crs: 'EPSG:4326'}))).toBe(UNSUPPORTED)
    })

    it('rejects a south-up or malformed transform', () => {
        expect(key(unstratifiedSystematicGridError({crs: 'EPSG:6933', crsTransform: '[10,0,0,0,10,0]'}))).toBe(INVALID_TRANSFORM)
        expect(key(unstratifiedSystematicGridError({crs: 'EPSG:6933', crsTransform: 'nonsense'}))).toBe(INVALID_TRANSFORM)
    })
})

// The stratified systematic lattice sits on the stratification grid, so samples can never be closer than two
// grid pixels. Kept separate from the grid-definition errors: random validates its grid with those but has no
// minimum distance, and unstratified systematic is analytical.
describe('stratifiedMinDistanceError', () => {
    const BELOW_GRID = 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid'

    it('rejects a distance below two pixels of a scale grid', () => {
        const error = stratifiedMinDistanceError({minDistance: 19, scale: 10})
        expect(key(error)).toBe(BELOW_GRID)
        expect(error.userMessage.args).toEqual({minimum: 20, pixelSize: 10})
    })

    it('accepts a distance at or above the floor', () => {
        expect(stratifiedMinDistanceError({minDistance: 20, scale: 10})).toBeNull()
        expect(stratifiedMinDistanceError({minDistance: 60, scale: 10})).toBeNull()
    })

    it('applies the same floor to an equivalent transform grid', () => {
        expect(key(stratifiedMinDistanceError({minDistance: 19, crsTransform: '[10,0,0,0,-10,0]'}))).toBe(BELOW_GRID)
        expect(stratifiedMinDistanceError({minDistance: 20, crsTransform: '[10,0,0,0,-10,0]'})).toBeNull()
    })

    it('reports the floor for the coarser grid when the grid changes', () => {
        const error = stratifiedMinDistanceError({minDistance: 20, scale: 30})
        expect(error.userMessage.args).toEqual({minimum: 60, pixelSize: 30})
    })

    it('defers to the grid-definition error when the grid is indeterminate', () => {
        expect(stratifiedMinDistanceError({minDistance: 1, scale: 0})).toBeNull()
        expect(stratifiedMinDistanceError({minDistance: 1})).toBeNull()
    })

    // One focused check that the message interpolates its computed arguments.
    it('renders the computed minimum and pixel size in the message', () => {
        const error = stratifiedMinDistanceError({minDistance: 5, scale: 10})
        expect(error.message).toContain('at least 20 m')
        expect(error.message).toContain('10 m stratification grid')
    })
})
