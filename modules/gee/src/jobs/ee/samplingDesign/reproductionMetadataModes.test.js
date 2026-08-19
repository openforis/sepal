import {effectiveArrangement, resolveArrangementGrids} from '#sepal/ee/samplingDesign/effectiveArrangement'
import {collectionMetadata, REPRODUCTION_PROPERTY_NAMES} from '#sepal/ee/samplingDesign/sampleProperties'
import {randomReproductionMetadata, systematicReproductionMetadata} from '#sepal/ee/samplingDesign/samples'

// Reproduction metadata shape by mode. The effective arrangement decides which GRIDS exist, and the metadata
// builders reflect that: absent fields are omitted from asset (collection) metadata entirely, and the fixed
// SEPAL/CSV schema blanks them (never stale). `crs`/`gridCrs` are the placement grid - the Arrangement
// configured id - `stratificationCrs` is the interpretation grid, and `scale` is the Stratification pixel size.
const GRID_FIELDS = ['scale', 'crs', 'gridCrs', 'stratificationCrs']

const build = ({skip, arrangementStrategy}) => {
    const effective = effectiveArrangement({
        // Conflicting CRS on each side, so a builder reading the wrong grid is visible. EPSG:32636 is legal only
        // for Stratification; the Arrangement side stays curated.
        stratification: skip ? {skip: true} : {skip: false, scale: 300, crs: 'EPSG:32636'},
        sampleArrangement: {arrangementStrategy, sampleSizeStrategy: 'OVER', gridOrigin: 'FIXED', minDistance: 1000, seed: 7, crs: 'EPSG:6931'}
    })
    const resolved = resolveArrangementGrids(effective)
    return arrangementStrategy === 'RANDOM'
        ? randomReproductionMetadata(resolved)
        : systematicReproductionMetadata(resolved, 0)
}

const allocation = [{stratum: 1, label: 'AOI', color: '#0a0', area: 1000, weight: 1, sampleSize: 30}]
const assetKeys = reproduction => Object.keys(collectionMetadata({allocation, reproduction}))

describe('reproduction metadata by mode', () => {
    it('stratified Random records the Arrangement CRS as placement and the Stratification CRS separately', () => {
        const meta = build({skip: false, arrangementStrategy: 'RANDOM'})
        expect(meta).toMatchObject({
            arrangementStrategy: 'RANDOM', seed: 7, scale: 300,
            crs: 'EPSG:6931', gridCrs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'
        })
        GRID_FIELDS.forEach(field => expect(field in meta).toBe(true))
        expect('crsTransform' in meta).toBe(false)
        expect('gridCrsTransform' in meta).toBe(false)
    })

    it('unstratified Random omits all grid fields', () => {
        const meta = build({skip: true, arrangementStrategy: 'RANDOM'})
        expect(meta).toMatchObject({arrangementStrategy: 'RANDOM', sampleSizeStrategy: null, gridOrigin: null, seed: 7, selectedDensityOffset: null})
        GRID_FIELDS.forEach(field => expect(field in meta).toBe(false))
        // Asset (collection) metadata drops the grid keys entirely rather than carrying stale values.
        GRID_FIELDS.forEach(field => expect(assetKeys(meta)).not.toContain(field))
    })

    it('stratified Systematic records both grids, with no transform', () => {
        const meta = build({skip: false, arrangementStrategy: 'SYSTEMATIC'})
        expect(meta).toMatchObject({
            arrangementStrategy: 'SYSTEMATIC', minDistance: 1000, scale: 300,
            crs: 'EPSG:6931', gridCrs: 'EPSG:6931', stratificationCrs: 'EPSG:32636'
        })
        GRID_FIELDS.forEach(field => expect(field in meta).toBe(true))
        expect('crsTransform' in meta).toBe(false)
        expect('gridCrsTransform' in meta).toBe(false)
    })

    it('unstratified Systematic retains the Arrangement CRS but omits scale and stratificationCrs', () => {
        const meta = build({skip: true, arrangementStrategy: 'SYSTEMATIC'})
        expect(meta).toMatchObject({arrangementStrategy: 'SYSTEMATIC', minDistance: 1000, crs: 'EPSG:6931', gridCrs: 'EPSG:6931'})
        expect('scale' in meta).toBe(false)
        expect('stratificationCrs' in meta).toBe(false)
        expect('crsTransform' in meta).toBe(false)
        const keys = assetKeys(meta)
        expect(keys).toContain('crs')
        expect(keys).toContain('gridCrs')
        expect(keys).not.toContain('scale')
        expect(keys).not.toContain('stratificationCrs')
    })

    // The SEPAL/CSV export uses a fixed reproduction column schema, so non-applicable columns stay present and
    // are blanked (never stale). The schema therefore still lists every grid field.
    it('keeps the grid fields in the fixed SEPAL reproduction schema', () => {
        GRID_FIELDS.forEach(field => expect(REPRODUCTION_PROPERTY_NAMES).toContain(field))
    })

    it('places stratificationCrs directly after gridCrs in the schema', () => {
        expect(REPRODUCTION_PROPERTY_NAMES[REPRODUCTION_PROPERTY_NAMES.indexOf('gridCrs') + 1]).toBe('stratificationCrs')
    })
})
