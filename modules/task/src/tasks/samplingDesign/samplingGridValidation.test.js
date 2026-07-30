import {EASE_GRID_2_GLOBAL_WKT} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {stratifiedGridError, stratifiedMinDistanceError, unstratifiedSystematicGridError} from './samplingGridValidation.js'

const key = error => error?.userMessage?.key
const UNSUPPORTED = 'tasks.samplingDesign.systematic.grid.unsupportedCrs'
const INVALID_SCALE = 'tasks.samplingDesign.systematic.grid.invalidScale'

describe('stratifiedGridError (task-boundary sampling-grid CRS/Scale contract)', () => {
    it('accepts a supported CRS with a valid Scale', () => {
        expect(stratifiedGridError({crs: 'EPSG:6933', scale: 10})).toBeNull()
    })

    it('accepts an unset CRS (resolves to the EPSG:6933 default) with a valid Scale', () => {
        expect(stratifiedGridError({scale: 10})).toBeNull()
    })

    it('rejects EPSG:4326 with a structured unsupported-CRS error listing concise option names', () => {
        const error = stratifiedGridError({crs: 'EPSG:4326', scale: 10})
        expect(key(error)).toBe(UNSUPPORTED)
        expect(error.userMessage.args.supported)
            .toBe('EPSG:6933 - EASE-Grid 2.0 Global, EPSG:6931 - EASE-Grid 2.0 North, EPSG:6932 - EASE-Grid 2.0 South')
        // The full WKT must never be dumped into user-facing text.
        expect(error.message).not.toContain('PROJCS')
    })

    it('rejects the raw WKT as a stored value; recipes store the option id', () => {
        expect(key(stratifiedGridError({crs: EASE_GRID_2_GLOBAL_WKT, scale: 10}))).toBe(UNSUPPORTED)
    })

    it('rejects CRSs outside the curated catalog', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:3410', scale: 10}))).toBe(UNSUPPORTED)
        expect(key(stratifiedGridError({crs: 'EPSG:3857', scale: 10}))).toBe(UNSUPPORTED)
    })

    it('rejects a missing Scale', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933'}))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: ''}))).toBe(INVALID_SCALE)
    })

    it('rejects a zero, negative or non-numeric Scale', () => {
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: 0}))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: -5}))).toBe(INVALID_SCALE)
        expect(key(stratifiedGridError({crs: 'EPSG:6933', scale: 'abc'}))).toBe(INVALID_SCALE)
    })
})

// Unstratified systematic sampling is analytical (CRS-only): spacing comes from minDistance, so a missing scale
// is not an error - only the CRS must be supported.
describe('unstratifiedSystematicGridError', () => {
    it('accepts a supported CRS with no scale', () => {
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6933'})).toBeNull()
        expect(unstratifiedSystematicGridError({})).toBeNull()
    })

    it('accepts every curated option id and rejects anything else', () => {
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6931'})).toBeNull()
        expect(unstratifiedSystematicGridError({crs: 'EPSG:6932'})).toBeNull()
        expect(key(unstratifiedSystematicGridError({crs: 'EPSG:3410'}))).toBe(UNSUPPORTED)
        expect(key(unstratifiedSystematicGridError({crs: 'EPSG:4326'}))).toBe(UNSUPPORTED)
    })
})

// The stratified systematic lattice sits on the stratification grid, so samples can never be closer than two
// grid pixels (2 * Stratification Scale).
describe('stratifiedMinDistanceError', () => {
    const BELOW_GRID = 'tasks.samplingDesign.systematic.grid.minDistanceBelowGrid'

    it('rejects a distance below two pixels of the Scale grid', () => {
        const error = stratifiedMinDistanceError({minDistance: 19, scale: 10})
        expect(key(error)).toBe(BELOW_GRID)
        expect(error.userMessage.args).toEqual({value: 19, pixelSize: 10, minimum: 20})
    })

    it('accepts a distance at or above the floor', () => {
        expect(stratifiedMinDistanceError({minDistance: 20, scale: 10})).toBeNull()
        expect(stratifiedMinDistanceError({minDistance: 60, scale: 10})).toBeNull()
    })

    it('reports the floor for the coarser grid when the Scale changes', () => {
        const error = stratifiedMinDistanceError({minDistance: 20, scale: 30})
        expect(error.userMessage.args).toEqual({value: 20, pixelSize: 30, minimum: 60})
    })

    it('defers to the grid-definition error when the Scale is indeterminate', () => {
        expect(stratifiedMinDistanceError({minDistance: 1, scale: 0})).toBeNull()
        expect(stratifiedMinDistanceError({minDistance: 1})).toBeNull()
    })

    it('rejects a non-numeric distance with its own structured error, before the floor rule', () => {
        const error = stratifiedMinDistanceError({minDistance: 'abc', scale: 10})
        expect(key(error)).toBe('tasks.samplingDesign.systematic.grid.invalidMinDistance')
        expect(error.message).not.toContain('NaN')
    })

    it('treats an unset distance as valid: it resolves to the floor', () => {
        expect(stratifiedMinDistanceError({scale: 10})).toBeNull()
        expect(stratifiedMinDistanceError({minDistance: '', scale: 10})).toBeNull()
    })

    it('formats decimals without floating-point noise', () => {
        expect(stratifiedMinDistanceError({minDistance: 0.1, scale: 0.15}).userMessage.args)
            .toEqual({value: 0.1, pixelSize: 0.15, minimum: 0.3})
    })
})
