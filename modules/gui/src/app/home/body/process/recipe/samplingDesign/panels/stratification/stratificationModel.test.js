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

    it('keeps scale as-is (no numeric/string coercion that would mismatch the model)', () => {
        expect(modelToValues({...savedModel, scale: 30}).resolvedScale).toBe(30)
    })

    // The user-facing fields stay BLANK; a saved grid is carried by the resolved fields, so blank keeps meaning
    // "use what the placeholder shows" rather than reading as an explicit choice on reopen.
    it('leaves the user CRS blank and carries a saved grid in the resolved fields', () => {
        expect(modelToValues({...savedModel, crs: undefined}).crs).toBeNull()
        expect(modelToValues({...savedModel, crs: 'EPSG:6931'}).resolvedCrs).toBe('EPSG:6931')
    })
})

describe('valuesToModel', () => {
    it('parses scale to a number for both numeric and string form values', () => {
        expect(valuesToModel({resolvedScale: 30}).scale).toBe(30)
        expect(valuesToModel({resolvedScale: '30'}).scale).toBe(30)
    })

    it('persists the RESOLVED grid, since the user fields are blank when the derived grid is in use', () => {
        expect(valuesToModel({resolvedScale: 30, resolvedCrs: 'EPSG:6931'}).crs).toBe('EPSG:6931')
        expect(valuesToModel({resolvedScale: 10, resolvedCrs: 'EPSG:32633'}).scale).toBe(10)
    })

    it('does not carry the transient requiresUpdate flag into the model', () => {
        expect('requiresUpdate' in valuesToModel({...savedModel, requiresUpdate: true})).toBe(false)
    })
})

describe('round trip', () => {
    it('valuesToModel(modelToValues(savedModel)) preserves the canonical saved model shape', () => {
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
