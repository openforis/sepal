import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {DEFAULT_SAMPLING_GRID_CRS, EASE_GRID_2_GLOBAL_WKT, isSupportedSamplingGridCrs, isValidStratificationCrs, resolveSamplingGrid, resolveSamplingGridCrs, resolveStratificationCrs, resolveStratificationGrid, SAMPLING_GRID_CRS_DEFINITIONS, supportedSamplingGridCrsNames} from './samplingGridCrs.js'

describe('curated sampling-grid CRS catalog', () => {
    it('defaults new designs to EASE-Grid 2.0 Global', () => {
        assert.equal(DEFAULT_SAMPLING_GRID_CRS, 'EPSG:6933')
    })

    it('supports exactly the three curated option ids, and nothing else', () => {
        assert.deepEqual(
            SAMPLING_GRID_CRS_DEFINITIONS.map(({id}) => id),
            ['EPSG:6933', 'EPSG:6931', 'EPSG:6932']
        )
        for (const crs of ['EPSG:6933', 'EPSG:6931', 'EPSG:6932']) {
            assert.equal(isSupportedSamplingGridCrs(crs), true)
        }
        // EPSG:3410 is no longer part of the product catalog.
        for (const crs of ['EPSG:3410', 'EPSG:4326', 'EPSG:3857', 'EPSG:32633', 'nonsense', EASE_GRID_2_GLOBAL_WKT]) {
            assert.equal(isSupportedSamplingGridCrs(crs), false)
        }
    })

    it('treats an absent CRS as the default, so it is supported', () => {
        assert.equal(isSupportedSamplingGridCrs(undefined), true)
        assert.equal(isSupportedSamplingGridCrs(''), true)
    })
})

describe('resolution to Earth Engine values', () => {
    it('resolves EPSG:6933 to the exact tested WKT', () => {
        assert.equal(resolveSamplingGridCrs('EPSG:6933'), EASE_GRID_2_GLOBAL_WKT)
    })

    it('resolves the polar variants to their EPSG id, which EE accepts directly', () => {
        assert.equal(resolveSamplingGridCrs('EPSG:6931'), 'EPSG:6931')
        assert.equal(resolveSamplingGridCrs('EPSG:6932'), 'EPSG:6932')
    })

    it('resolves an absent CRS to the default WKT', () => {
        assert.equal(resolveSamplingGridCrs(undefined), EASE_GRID_2_GLOBAL_WKT)
    })

    // The whole point of the catalog: EE cannot parse the literal id.
    it('never yields the literal EPSG:6933 from any curated option', () => {
        for (const {id} of SAMPLING_GRID_CRS_DEFINITIONS) {
            assert.notEqual(resolveSamplingGridCrs(id), 'EPSG:6933')
        }
        assert.notEqual(resolveSamplingGrid({crs: 'EPSG:6933', scale: 10}).crs, 'EPSG:6933')
        assert.notEqual(resolveSamplingGrid({}).crs, 'EPSG:6933')
    })

    it('carries every other grid field through resolution unchanged', () => {
        assert.deepEqual(
            resolveSamplingGrid({crs: 'EPSG:6933', scale: undefined, minDistance: 60}),
            {crs: EASE_GRID_2_GLOBAL_WKT, crsId: 'EPSG:6933', scale: undefined, minDistance: 60}
        )
        assert.deepEqual(
            resolveSamplingGrid({crs: 'EPSG:6931', scale: 30, minDistance: 60, seed: 6}),
            {crs: 'EPSG:6931', crsId: 'EPSG:6931', scale: 30, minDistance: 60, seed: 6}
        )
    })

    // Fails closed: an unsupported value must never reach EE, where it would pick up an image projection.
    it('throws for an unsupported id rather than passing it to EE', () => {
        assert.throws(() => resolveSamplingGridCrs('EPSG:4326'), /Unsupported sampling grid CRS/)
        assert.throws(() => resolveSamplingGridCrs('EPSG:3410'), /Unsupported sampling grid CRS/)
        assert.throws(
            () => resolveSamplingGrid({crs: 'nonsense', scale: 10}),
            /Unsupported sampling grid CRS/
        )
    })
})

describe('user-facing option names', () => {
    it('are concise and never contain the raw WKT', () => {
        assert.deepEqual(
            supportedSamplingGridCrsNames(),
            ['EPSG:6933 - EASE-Grid 2.0 Global', 'EPSG:6931 - EASE-Grid 2.0 North', 'EPSG:6932 - EASE-Grid 2.0 South']
        )
        for (const name of supportedSamplingGridCrsNames()) {
            assert.ok(!name.includes('PROJCS'))
        }
    })
})

// Reproduction metadata and logs must record the configured id, never the resolved WKT.
describe('configured id on the resolved grid', () => {
    it('keeps the configured id alongside the EE value', () => {
        assert.equal(resolveSamplingGrid({crs: 'EPSG:6933', scale: 10}).crsId, 'EPSG:6933')
        assert.equal(resolveSamplingGrid({crs: 'EPSG:6931', scale: 10}).crsId, 'EPSG:6931')
        assert.equal(resolveSamplingGrid({}).crsId, 'EPSG:6933')
    })

    it('never exposes the WKT as the configured id', () => {
        for (const {id} of SAMPLING_GRID_CRS_DEFINITIONS) {
            assert.ok(!resolveSamplingGrid({crs: id}).crsId.includes('PROJCS'))
        }
    })
})

// Stratification interprets the categorical source, so its CRS is NOT restricted to the curated Arrangement
// list: any projected CRS the source is meant to be read in must be accepted.
describe('Stratification CRS', () => {
    describe('isValidStratificationCrs', () => {
        it('accepts any non-blank string, curated or not', () => {
            assert.equal(isValidStratificationCrs('EPSG:32636'), true)
            assert.equal(isValidStratificationCrs('EPSG:6933'), true)
            assert.equal(isValidStratificationCrs('EPSG:4326'), true)
        })

        it('rejects blank, whitespace-only and non-string values', () => {
            assert.equal(isValidStratificationCrs(''), false)
            assert.equal(isValidStratificationCrs('   '), false)
            assert.equal(isValidStratificationCrs(null), false)
            assert.equal(isValidStratificationCrs(undefined), false)
            assert.equal(isValidStratificationCrs(6933), false)
        })
    })

    describe('resolveStratificationCrs', () => {
        it('resolves EPSG:6933 to the WKT Earth Engine can parse', () => {
            assert.equal(resolveStratificationCrs('EPSG:6933'), EASE_GRID_2_GLOBAL_WKT)
        })

        it('passes any other CRS through unchanged', () => {
            assert.equal(resolveStratificationCrs('EPSG:32636'), 'EPSG:32636')
            assert.equal(resolveStratificationCrs('EPSG:6931'), 'EPSG:6931')
            assert.equal(resolveStratificationCrs('EPSG:4326'), 'EPSG:4326')
        })

        it('throws on blank so nothing falls through to Earth Engine', () => {
            assert.throws(() => resolveStratificationCrs(''), /Stratification CRS/)
            assert.throws(() => resolveStratificationCrs('  '), /Stratification CRS/)
            assert.throws(() => resolveStratificationCrs(null), /Stratification CRS/)
            assert.throws(() => resolveStratificationCrs(undefined), /Stratification CRS/)
        })
    })

    describe('resolveStratificationGrid', () => {
        it('resolves the CRS for Earth Engine and keeps the configured id', () => {
            assert.deepEqual(
                resolveStratificationGrid({crs: 'EPSG:6933', scale: 10}),
                {crs: EASE_GRID_2_GLOBAL_WKT, crsId: 'EPSG:6933', scale: 10}
            )
        })

        it('keeps a non-curated CRS as both the EE value and the configured id', () => {
            assert.deepEqual(
                resolveStratificationGrid({crs: 'EPSG:32636', scale: 30}),
                {crs: 'EPSG:32636', crsId: 'EPSG:32636', scale: 30}
            )
        })

        it('throws on a blank CRS rather than defaulting', () => {
            assert.throws(() => resolveStratificationGrid({scale: 10}), /Stratification CRS/)
        })
    })
})
