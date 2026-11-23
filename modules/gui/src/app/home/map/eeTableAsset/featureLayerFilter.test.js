import {isFeatureLayerFilterValid, newFeatureLayerConstraint, resolveFeatureLayerFilter} from './featureLayerFilter'

const filter = constraints => ({booleanOperator: 'and', constraints})

describe('resolveFeatureLayerFilter', () => {
    it('defaults to an empty all-match filter', () => {
        expect(resolveFeatureLayerFilter()).toEqual({booleanOperator: 'and', constraints: []})
    })

    it('preserves a supported persisted filter', () => {
        const persisted = {booleanOperator: 'or', constraints: [{id: 'a', property: 'class', operator: '=', value: 'forest'}]}
        expect(resolveFeatureLayerFilter({layerConfig: {filter: persisted}})).toEqual(persisted)
    })

    it('normalizes malformed structure', () => {
        expect(resolveFeatureLayerFilter({layerConfig: {filter: {booleanOperator: 'xor', constraints: {}}}}))
            .toEqual({booleanOperator: 'and', constraints: []})
    })
})

describe('isFeatureLayerFilterValid', () => {
    it('accepts an empty filter', () => {
        expect(isFeatureLayerFilterValid({filter: filter([])})).toBe(true)
    })

    it('accepts string and numeric equality values, including zero', () => {
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'class', operator: '=', value: 'forest'},
            {property: 'code', operator: '=', value: 0}
        ])})).toBe(true)
    })

    it('accepts one or more selected categorical values', () => {
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'class', operator: 'class', selectedClasses: ['forest', 'water']}
        ])})).toBe(true)
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'class', operator: 'class', selectedClasses: []}
        ])})).toBe(false)
    })

    it('requires finite numbers for ordered and range comparisons', () => {
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'score', operator: '≥', value: 3},
            {property: 'area', operator: 'range', from: 10, to: 20}
        ])})).toBe(true)
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'score', operator: '>', value: NaN}
        ])})).toBe(false)
    })

    it('rejects incomplete and currently-invalid constraints', () => {
        expect(isFeatureLayerFilterValid({filter: filter([{property: '', operator: '=', value: 'x'}])})).toBe(false)
        expect(isFeatureLayerFilterValid({
            filter: filter([{id: 'a', property: 'class', operator: '=', value: 'forest'}]),
            invalidById: {a: true}
        })).toBe(false)
    })
})

describe('newFeatureLayerConstraint', () => {
    const categoriesByProperty = {stratum: [{value: '1', color: '#ffffff', label: 'Forest'}]}
    const style = {colorMode: 'COLORS_BY_VALUE', valueProperty: 'stratum'}

    it('defaults the first filter to the categorized By Value property', () => {
        expect(newFeatureLayerConstraint({
            id: 'a', columns: ['id', 'stratum'], filter: filter([]), style, categoriesByProperty
        })).toEqual({
            id: 'a', image: 'feature-layer', property: 'stratum', operator: 'class', selectedClasses: []
        })
    })

    it('does not default subsequent filters to the By Value property', () => {
        expect(newFeatureLayerConstraint({
            id: 'b',
            columns: ['id', 'stratum'],
            filter: filter([{property: 'stratum', operator: '=', value: '1'}]),
            style,
            categoriesByProperty
        }).property).toBeNull()
    })

    it('keeps the one-column default and equality fallback', () => {
        expect(newFeatureLayerConstraint({
            id: 'c', columns: ['id'], filter: filter([]), style, categoriesByProperty
        })).toMatchObject({property: 'id', operator: '='})
    })
})
