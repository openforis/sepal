import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {modelToValues, syntheticUnstratifiedStratum, unstratifiedStrata, valuesToModel} = await import('./stratificationModel')

// A canonical saved stratification model: the exact shape valuesToModel produces (no transient requiresUpdate).
const savedModel = {
    skip: false,
    scale: 30,
    crs: 'EPSG:6933',
    type: 'ASSET',
    assetId: 'users/test/strata',
    recipeId: undefined,
    band: 'class',
    strata: [{value: 1, stratum: 1, area: 100, weight: 1}],
    eeStrategy: 'ONLINE'
}

describe('modelToValues', () => {
    it('initializes requiresUpdate to false for an up-to-date model, so requiresUpdate.set(false) is a no-op', () => {
        expect(modelToValues({...savedModel, requiresUpdate: false}).requiresUpdate).toBe(false)
        expect(modelToValues(savedModel).requiresUpdate).toBe(false)
    })

    it('preserves requiresUpdate: true so a stale model recalculates on open', () => {
        expect(modelToValues({...savedModel, requiresUpdate: true}).requiresUpdate).toBe(true)
    })

    it('applies the ONLINE eeStrategy default only when missing', () => {
        expect(modelToValues({...savedModel, eeStrategy: undefined}).eeStrategy).toBe('ONLINE')
        expect(modelToValues({...savedModel, eeStrategy: 'BATCH'}).eeStrategy).toBe('BATCH')
    })

    it('does not carry the transient requiresUpdate flag into the model', () => {
        expect('requiresUpdate' in valuesToModel({...savedModel, requiresUpdate: true})).toBe(false)
    })
})

// The visible CRS and Scale fields ARE the grid. There are no hidden resolved fields and no transform: whether
// the design ends up on the source's own pixel grid is decided inside Earth Engine, from the selected band's
// projection, so nothing about alignment is persisted.
describe('persists the visible CRS and metre Scale as the complete Stratification grid', () => {
    it('takes the grid from the visible fields', () => {
        expect(valuesToModel({...savedModel, crs: 'EPSG:32633', scale: 10}))
            .toMatchObject({crs: 'EPSG:32633', scale: 10})
    })

    it('parses a typed Scale to a number, keeping fractions', () => {
        expect(valuesToModel({...savedModel, scale: '30'}).scale).toBe(30)
        expect(valuesToModel({...savedModel, scale: '9.9763'}).scale).toBe(9.9763)
    })

    it('shows a saved grid in the visible fields on reopen', () => {
        const values = modelToValues({...savedModel, crs: 'EPSG:32633', scale: 10})
        expect(values.crs).toBe('EPSG:32633')
        expect(values.scale).toBe(10)
    })

    it('carries the grid in those two fields and no others', () => {
        const model = valuesToModel({...savedModel, crs: 'EPSG:32633', scale: 10})
        expect(Object.keys(model).filter(key => /crs|scale|grid/i.test(key)).sort()).toEqual(['crs', 'scale'])
        const values = modelToValues(savedModel)
        expect(Object.keys(values).filter(key => /crs|scale|grid/i.test(key)).sort()).toEqual(['crs', 'scale'])
    })

    // The visible fields are overrides, so what a blank one resolves to is what gets stored. The source values
    // the panel resolved against are form state and must not reach the recipe.
    it('consolidates a cleared field into the source value it resolves to', () => {
        expect(valuesToModel({...savedModel, crs: '', scale: '', sourceCrs: 'EPSG:32633', sourceScale: 10}))
            .toMatchObject({crs: 'EPSG:32633', scale: 10})
    })

    it('keeps an entered override over the source value', () => {
        expect(valuesToModel({...savedModel, crs: 'EPSG:6933', scale: '30', sourceCrs: 'EPSG:32633', sourceScale: 10}))
            .toMatchObject({crs: 'EPSG:6933', scale: 30})
    })

    it('resolves to the recipe default when neither is available', () => {
        expect(valuesToModel({...savedModel, crs: '', scale: ''}))
            .toMatchObject({crs: 'EPSG:4326', scale: 30})
    })

    it('never persists the transient source fields', () => {
        const model = valuesToModel({...savedModel, crs: '', scale: '', sourceCrs: 'EPSG:32633', sourceScale: 10})
        expect('sourceCrs' in model).toBe(false)
        expect('sourceScale' in model).toBe(false)
    })

    // Blank means "use the default" while the panel is open; it is not a mode, so reopening shows the value
    // that was stored rather than an empty field.
    it('does not carry blank override intent back into the form', () => {
        expect(modelToValues({...savedModel, crs: 'EPSG:32633', scale: 10}))
            .toMatchObject({crs: 'EPSG:32633', scale: 10})
    })

    it('round trips the canonical saved model unchanged', () => {
        expect(valuesToModel(modelToValues(savedModel))).toEqual(savedModel)
    })
})

describe('syntheticUnstratifiedStratum', () => {
    it('is a single synthetic row with no area (area is filled at the export boundary)', () => {
        const row = syntheticUnstratifiedStratum('Area of interest')
        expect(row).toEqual({color: '#000000', label: 'Area of interest', value: 1, stratum: 1, weight: 1})
        expect('area' in row).toBe(false)
    })
})

describe('unstratifiedStrata', () => {
    it('accepts the synthetic row without requiring an area (unstratified is valid before area is computed)', () => {
        const result = unstratifiedStrata([{color: '#000000', label: 'AOI', value: 1, stratum: 1, weight: 1}])
        expect(result).toEqual([{color: '#000000', label: 'AOI', value: 1, stratum: 1, weight: 1}])
        expect('area' in result[0]).toBe(false)
    })

    it('carries a finite positive area through when one is present', () => {
        expect(unstratifiedStrata([{label: 'AOI', area: 1.2e9}])[0].area).toBe(1.2e9)
    })

    it('does not treat stale multi-row stratified data as a valid unstratified result', () => {
        expect(unstratifiedStrata([{value: 1, area: 3e8}, {value: 2, area: 7e8}])).toEqual([])
    })

    it('round-trips an unstratified model (skip) with no area', () => {
        const values = {skip: [true], scale: 30, type: 'ASSET', strata: [{label: 'AOI', color: '#000000', value: 1, stratum: 1, weight: 1}]}
        const model = valuesToModel(values)
        expect(model.skip).toBe(true)
        expect(model.strata).toEqual([{color: '#000000', label: 'AOI', value: 1, stratum: 1, weight: 1}])
        expect('area' in model.strata[0]).toBe(false)
    })
})
