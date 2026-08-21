import {DEFAULT_SAMPLING_GRID_CRS, EASE_GRID_2_GLOBAL_WKT, isSupportedSamplingGridCrs, isValidStratificationCrs, resolveSamplingGrid, resolveSamplingGridCrs, resolveStratificationCrs, resolveStratificationGrid, SAMPLING_GRID_CRS_DEFINITIONS, supportedSamplingGridCrsNames} from './samplingGridCrs.js'

describe('curated sampling-grid CRS catalog', () => {
    it('defaults new designs to EASE-Grid 2.0 Global', () => {
        expect(DEFAULT_SAMPLING_GRID_CRS).toBe('EPSG:6933')
    })

    it('supports exactly the three curated option ids, and nothing else', () => {
        expect(SAMPLING_GRID_CRS_DEFINITIONS.map(({id}) => id)).toEqual(['EPSG:6933', 'EPSG:6931', 'EPSG:6932'])
        for (const crs of ['EPSG:6933', 'EPSG:6931', 'EPSG:6932']) {
            expect(isSupportedSamplingGridCrs(crs)).toBe(true)
        }
        // EPSG:3410 is no longer part of the product catalog.
        for (const crs of ['EPSG:3410', 'EPSG:4326', 'EPSG:3857', 'EPSG:32633', 'nonsense', EASE_GRID_2_GLOBAL_WKT]) {
            expect(isSupportedSamplingGridCrs(crs)).toBe(false)
        }
    })

    it('treats an absent CRS as the default, so it is supported', () => {
        expect(isSupportedSamplingGridCrs(undefined)).toBe(true)
        expect(isSupportedSamplingGridCrs('')).toBe(true)
    })
})

describe('resolution to Earth Engine values', () => {
    it('resolves EPSG:6933 to the exact tested WKT', () => {
        expect(resolveSamplingGridCrs('EPSG:6933')).toBe(EASE_GRID_2_GLOBAL_WKT)
    })

    it('resolves the polar variants to their EPSG id, which EE accepts directly', () => {
        expect(resolveSamplingGridCrs('EPSG:6931')).toBe('EPSG:6931')
        expect(resolveSamplingGridCrs('EPSG:6932')).toBe('EPSG:6932')
    })

    it('resolves an absent CRS to the default WKT', () => {
        expect(resolveSamplingGridCrs(undefined)).toBe(EASE_GRID_2_GLOBAL_WKT)
    })

    // The whole point of the catalog: EE cannot parse the literal id.
    it('never yields the literal EPSG:6933 from any curated option', () => {
        for (const {id} of SAMPLING_GRID_CRS_DEFINITIONS) {
            expect(resolveSamplingGridCrs(id)).not.toBe('EPSG:6933')
        }
        expect(resolveSamplingGrid({crs: 'EPSG:6933', scale: 10}).crs).not.toBe('EPSG:6933')
        expect(resolveSamplingGrid({}).crs).not.toBe('EPSG:6933')
    })

    it('carries every other grid field through resolution unchanged', () => {
        expect(resolveSamplingGrid({crs: 'EPSG:6933', scale: undefined, minDistance: 60}))
            .toEqual({crs: EASE_GRID_2_GLOBAL_WKT, crsId: 'EPSG:6933', scale: undefined, minDistance: 60})
        expect(resolveSamplingGrid({crs: 'EPSG:6931', scale: 30, minDistance: 60, seed: 6}))
            .toEqual({crs: 'EPSG:6931', crsId: 'EPSG:6931', scale: 30, minDistance: 60, seed: 6})
    })

    // Fails closed: an unsupported value must never reach EE, where it would pick up an image projection.
    it('throws for an unsupported id rather than passing it to EE', () => {
        expect(() => resolveSamplingGridCrs('EPSG:4326')).toThrow(/Unsupported sampling grid CRS/)
        expect(() => resolveSamplingGridCrs('EPSG:3410')).toThrow(/Unsupported sampling grid CRS/)
        expect(() => resolveSamplingGrid({crs: 'nonsense', scale: 10})).toThrow(/Unsupported sampling grid CRS/)
    })
})

describe('user-facing option names', () => {
    it('are concise and never contain the raw WKT', () => {
        expect(supportedSamplingGridCrsNames())
            .toEqual(['EPSG:6933 - EASE-Grid 2.0 Global', 'EPSG:6931 - EASE-Grid 2.0 North', 'EPSG:6932 - EASE-Grid 2.0 South'])
        for (const name of supportedSamplingGridCrsNames()) {
            expect(name).not.toContain('PROJCS')
        }
    })
})

// Reproduction metadata and logs must record the configured id, never the resolved WKT.
describe('configured id on the resolved grid', () => {
    it('keeps the configured id alongside the EE value', () => {
        expect(resolveSamplingGrid({crs: 'EPSG:6933', scale: 10}).crsId).toBe('EPSG:6933')
        expect(resolveSamplingGrid({crs: 'EPSG:6931', scale: 10}).crsId).toBe('EPSG:6931')
        expect(resolveSamplingGrid({}).crsId).toBe('EPSG:6933')
    })

    it('never exposes the WKT as the configured id', () => {
        for (const {id} of SAMPLING_GRID_CRS_DEFINITIONS) {
            expect(resolveSamplingGrid({crs: id}).crsId).not.toContain('PROJCS')
        }
    })
})

// Stratification interprets the categorical source, so its CRS is NOT restricted to the curated Arrangement
// list: any projected CRS the source is meant to be read in must be accepted.
describe('Stratification CRS', () => {
    describe('isValidStratificationCrs', () => {
        it('accepts any non-blank string, curated or not', () => {
            expect(isValidStratificationCrs('EPSG:32636')).toBe(true)
            expect(isValidStratificationCrs('EPSG:6933')).toBe(true)
            expect(isValidStratificationCrs('EPSG:4326')).toBe(true)
        })

        it('rejects blank, whitespace-only and non-string values', () => {
            expect(isValidStratificationCrs('')).toBe(false)
            expect(isValidStratificationCrs('   ')).toBe(false)
            expect(isValidStratificationCrs(null)).toBe(false)
            expect(isValidStratificationCrs(undefined)).toBe(false)
            expect(isValidStratificationCrs(6933)).toBe(false)
        })
    })

    describe('resolveStratificationCrs', () => {
        it('resolves EPSG:6933 to the WKT Earth Engine can parse', () => {
            expect(resolveStratificationCrs('EPSG:6933')).toBe(EASE_GRID_2_GLOBAL_WKT)
        })

        it('passes any other CRS through unchanged', () => {
            expect(resolveStratificationCrs('EPSG:32636')).toBe('EPSG:32636')
            expect(resolveStratificationCrs('EPSG:6931')).toBe('EPSG:6931')
            expect(resolveStratificationCrs('EPSG:4326')).toBe('EPSG:4326')
        })

        it('throws on blank so nothing falls through to Earth Engine', () => {
            expect(() => resolveStratificationCrs('')).toThrow(/Stratification CRS/)
            expect(() => resolveStratificationCrs('  ')).toThrow(/Stratification CRS/)
            expect(() => resolveStratificationCrs(null)).toThrow(/Stratification CRS/)
            expect(() => resolveStratificationCrs(undefined)).toThrow(/Stratification CRS/)
        })
    })

    describe('resolveStratificationGrid', () => {
        it('resolves the CRS for Earth Engine and keeps the configured id', () => {
            expect(resolveStratificationGrid({crs: 'EPSG:6933', scale: 10}))
                .toEqual({crs: EASE_GRID_2_GLOBAL_WKT, crsId: 'EPSG:6933', scale: 10})
        })

        it('keeps a non-curated CRS as both the EE value and the configured id', () => {
            expect(resolveStratificationGrid({crs: 'EPSG:32636', scale: 30}))
                .toEqual({crs: 'EPSG:32636', crsId: 'EPSG:32636', scale: 30})
        })

        it('throws on a blank CRS rather than defaulting', () => {
            expect(() => resolveStratificationGrid({scale: 10})).toThrow(/Stratification CRS/)
        })
    })
})
