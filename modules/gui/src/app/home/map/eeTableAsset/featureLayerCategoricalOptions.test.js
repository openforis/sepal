import {buildCategoriesByProperty, categoricalLabelsByValue, valueLabelsFromEntries} from './featureLayerCategoricalOptions'

describe('categoricalLabelsByValue', () => {
    it('returns only labelled values for the property', () => {
        const categoricalProperties = {
            stratum: [{value: '1', color: '#a', label: 'Forest'}, {value: '2', color: '#b'}]
        }
        expect(categoricalLabelsByValue(categoricalProperties, 'stratum')).toEqual({'1': 'Forest'})
    })

    it('is empty for an unknown property or absent metadata', () => {
        expect(categoricalLabelsByValue({}, 'stratum')).toEqual({})
        expect(categoricalLabelsByValue(undefined, 'stratum')).toEqual({})
    })
})

describe('valueLabelsFromEntries', () => {
    it('persists only explicit label overrides, including an explicit blank', () => {
        expect(valueLabelsFromEntries([
            {value: '1', label: ' Woodland '},
            {value: '2'},
            {value: '3', label: ''},
            {value: '  ', label: 'Ignored'}
        ])).toEqual({'1': 'Woodland', '3': ''})
    })
})

describe('buildCategoriesByProperty', () => {
    it('uses source categoricalProperties as the baseline', () => {
        const categoricalProperties = {
            stratum: [{value: '1', color: '#ff0000', label: 'Forest'}],
            zone: [{value: 'a', color: '#00ff00'}]
        }
        const result = buildCategoriesByProperty({categoricalProperties})
        expect(result).toEqual(categoricalProperties)
    })

    it('falls back to defaultStyle.valueColors (label-less) when there is no categorical baseline', () => {
        const result = buildCategoriesByProperty({
            defaultStyle: {valueProperty: 'stratum', valueColors: {'1': '#ff0000', '2': '#00ff00'}}
        })
        expect(result.stratum).toEqual([{value: '1', color: '#ff0000'}, {value: '2', color: '#00ff00'}])
    })

    it('includes defaultStyle.valueLabels in the label-less fallback path', () => {
        const result = buildCategoriesByProperty({
            defaultStyle: {
                valueProperty: 'stratum',
                valueColors: {'1': '#ff0000', '2': '#00ff00'},
                valueLabels: {'1': 'Forest'}
            }
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#ff0000', label: 'Forest'},
            {value: '2', color: '#00ff00'}
        ])
    })

    it('prefers the labelled baseline over the valueColors fallback for the same property', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {stratum: [{value: '1', color: '#ff0000', label: 'Forest'}]},
            defaultStyle: {valueProperty: 'stratum', valueColors: {'1': '#123456'}}
        })
        expect(result.stratum).toEqual([{value: '1', color: '#ff0000', label: 'Forest'}])
    })

    it('overrides baseline colors with current By-value entries for the same value, keeping the label', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {stratum: [{value: '1', color: '#ff0000', label: 'Forest'}]},
            entries: [{value: '1', color: '#0000ff'}],
            valueProperty: 'stratum'
        })
        expect(result.stratum).toEqual([{value: '1', color: '#0000ff', label: 'Forest'}])
    })

    it('overrides, adds, and explicitly clears labels through current By-value entries', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {
                stratum: [
                    {value: '1', color: '#ff0000', label: 'Forest'},
                    {value: '2', color: '#00ff00', label: 'Water'}
                ]
            },
            entries: [
                {value: '1', color: '#ff0000', label: 'Woodland'},
                {value: '2', color: '#00ff00', label: ''},
                {value: '9', color: '#0000ff', label: 'Other'}
            ],
            valueProperty: 'stratum'
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#ff0000', label: 'Woodland'},
            {value: '2', color: '#00ff00'},
            {value: '9', color: '#0000ff', label: 'Other'}
        ])
    })

    it('appends new (label-less) values introduced by By-value entries', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {stratum: [{value: '1', color: '#ff0000', label: 'Forest'}]},
            entries: [{value: '1', color: '#ff0000'}, {value: '9', color: '#0000ff'}],
            valueProperty: 'stratum'
        })
        expect(result.stratum).toEqual([
            {value: '1', color: '#ff0000', label: 'Forest'},
            {value: '9', color: '#0000ff'}
        ])
    })

    it('excludes blank By-value entries', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {stratum: [{value: '1', color: '#ff0000', label: 'Forest'}]},
            entries: [{value: '', color: '#0000ff'}, {value: '   ', color: '#00ff00'}],
            valueProperty: 'stratum'
        })
        expect(result.stratum).toEqual([{value: '1', color: '#ff0000', label: 'Forest'}])
    })

    it('normalizes numeric entry values to strings so they align with metadata values', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {stratum: [{value: '1', color: '#ff0000', label: 'Forest'}]},
            entries: [{value: 1, color: '#0000ff'}],
            valueProperty: 'stratum'
        })
        expect(result.stratum).toEqual([{value: '1', color: '#0000ff', label: 'Forest'}])
    })

    it('only overlays entries onto the active valueProperty', () => {
        const result = buildCategoriesByProperty({
            categoricalProperties: {
                stratum: [{value: '1', color: '#ff0000', label: 'Forest'}],
                zone: [{value: 'a', color: '#00ff00'}]
            },
            entries: [{value: 'a', color: '#000000'}],
            valueProperty: 'stratum'
        })
        // zone is untouched; the 'a' entry is applied to stratum (the active property), not zone.
        expect(result.zone).toEqual([{value: 'a', color: '#00ff00'}])
        expect(result.stratum).toContainEqual({value: 'a', color: '#000000'})
    })

    it('returns an empty map with no inputs', () => {
        expect(buildCategoriesByProperty()).toEqual({})
    })
})
