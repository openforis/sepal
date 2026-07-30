import {categoricalLegendEntries, isNumericClassValue, toClassOptions} from './categoricalLegend'

const visualizations = [
    {type: 'continuous', bands: ['probability'], min: [0], max: [1]},
    {type: 'categorical', bands: ['class'], values: [1, 2, 3], labels: ['Forest', 'Water', ''], palette: ['#008000', '#0000ff', '#999999']},
    {type: 'categorical', bands: ['change'], values: [0, 1]}
]

it('returns value/label/color options for a categorical band, combining value and label', () => {
    expect(categoricalLegendEntries(visualizations, 'class')).toEqual([
        {value: 1, label: '1 - Forest', color: '#008000'},
        {value: 2, label: '2 - Water', color: '#0000ff'},
        {value: 3, label: '3', color: '#999999'}
    ])
})

it('falls back to the value as label when labels are missing', () => {
    expect(categoricalLegendEntries(visualizations, 'change')).toEqual([
        {value: 0, label: '0', color: undefined},
        {value: 1, label: '1', color: undefined}
    ])
})

it('returns [] for a non-categorical band', () => {
    expect(categoricalLegendEntries(visualizations, 'probability')).toEqual([])
})

it('returns [] for an unknown band, or missing inputs', () => {
    expect(categoricalLegendEntries(visualizations, 'missing')).toEqual([])
    expect(categoricalLegendEntries(undefined, 'class')).toEqual([])
    expect(categoricalLegendEntries(visualizations, undefined)).toEqual([])
})

describe('isNumericClassValue', () => {
    it('accepts class value 0 (number and string)', () => {
        expect(isNumericClassValue(0)).toBe(true)
        expect(isNumericClassValue('0')).toBe(true)
    })

    it('accepts other numeric values', () => {
        expect(isNumericClassValue(2)).toBe(true)
        expect(isNumericClassValue('3')).toBe(true)
    })

    it('rejects non-numeric text', () => {
        expect(isNumericClassValue('forest')).toBe(false)
        expect(isNumericClassValue('1a')).toBe(false)
    })

    it('rejects blank/whitespace/missing values', () => {
        expect(isNumericClassValue('')).toBe(false)
        expect(isNumericClassValue(' ')).toBe(false)
        expect(isNumericClassValue('   ')).toBe(false)
        expect(isNumericClassValue(null)).toBe(false)
        expect(isNumericClassValue(undefined)).toBe(false)
    })
})

describe('toClassOptions', () => {
    it('maps distinct values to {value, label} options', () => {
        expect(toClassOptions([0, 1, 2])).toEqual([
            {value: 0, label: '0'},
            {value: 1, label: '1'},
            {value: 2, label: '2'}
        ])
    })

    it('returns [] for empty/missing input', () => {
        expect(toClassOptions([])).toEqual([])
        expect(toClassOptions(undefined)).toEqual([])
    })
})
