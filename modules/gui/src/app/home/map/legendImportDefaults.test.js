import _ from 'lodash'
import {firstValueFrom} from 'rxjs'

import {parseCsvFile$} from '~/csv'

import {getDefaults, getValidMappings} from './legendImportDefaults'

const test = name => {
    const nameTemplate = _.template(name)
    return ({
        assert: assertion => ({
            where: (...data) =>
                data.forEach(data =>
                    it(nameTemplate(data), () => assertion(data))
                )
        })
    })
}

test('getValidMappings(${columns}, ${rows}) === ${result}')
    .assert(({columns, rows, result}) => expect(getValidMappings(columns, rows)).toEqual(result))
    .where(
        {
            columns: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
            rows: [
                {class: 0, label: 'foo', color: 'white', red: 0, green: 0, blue: 0, alpha: 0}
            ],
            result: {
                valueColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                labelColumn: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
                colorColumn: ['color'],
                redColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                greenColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                blueColumn: ['class', 'red', 'green', 'blue', 'alpha']
            }
        },
        {
            columns: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
            rows: [
                {class: 0, label: 'foo', color: 'white', red: 0, green: 0, blue: 0, alpha: 0},
                {class: 1, label: 'bar', color: 'black', red: 1, green: 1, blue: 1, alpha: 1},
            ],
            result: {
                valueColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                labelColumn: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
                colorColumn: ['color'],
                redColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                greenColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                blueColumn: ['class', 'red', 'green', 'blue', 'alpha']
            }
        },
        { // Duplicates
            columns: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
            rows: [
                {class: 0, label: 'foo', color: 'white', red: 0, green: 0, blue: 0, alpha: 0},
                {class: 0, label: 'foo', color: 'white', red: 0, green: 0, blue: 0, alpha: 0},
            ],
            result: {
                valueColumn: [],
                labelColumn: [],
                colorColumn: [],
                redColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                greenColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                blueColumn: ['class', 'red', 'green', 'blue', 'alpha']
            }
        },
        {
            columns: ['Value', 'ClassName', 'Red', 'Green', 'Blue', 'Alpha'],
            rows: [
                {Value: 0, ClassName: 'NA', Red: 255, Green: 255, Blue: 255, Alpha: 255},
                {Value: 1, ClassName: 'Tropics', Red: 247, Green: 159, Blue: 192, Alpha: 255}
            ],
            result: {
                valueColumn: ['Value', 'Red', 'Green', 'Blue'],
                labelColumn: ['Value', 'ClassName', 'Red', 'Green', 'Blue'],
                colorColumn: [],
                redColumn: ['Value', 'Red', 'Green', 'Blue', 'Alpha'],
                greenColumn: ['Value', 'Red', 'Green', 'Blue', 'Alpha'],
                blueColumn: ['Value', 'Red', 'Green', 'Blue', 'Alpha']
            }
        }
    )

test('getDefaults(${validMappings}) === ${result}')
    .assert(({validMappings, result}) => expect(getDefaults(validMappings)).toEqual(result))
    .where(
        {
            validMappings: {
                valueColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                labelColumn: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
                colorColumn: ['color'],
                redColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                greenColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                blueColumn: ['class', 'red', 'green', 'blue', 'alpha']
            },
            result: {
                valueColumn: 'class',
                labelColumn: 'label',
                colorColumnType: 'single',
                colorColumn: 'color',
                redColumn: 'red',
                greenColumn: 'green',
                blueColumn: 'blue'
            }
        },
        {
            validMappings: {
                valueColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                labelColumn: ['class', 'label', 'color', 'red', 'green', 'blue', 'alpha'],
                colorColumn: ['color'],
                redColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                greenColumn: ['class', 'red', 'green', 'blue', 'alpha'],
                blueColumn: ['class', 'red', 'green', 'blue', 'alpha']
            },
            result: {
                valueColumn: 'class',
                labelColumn: 'label',
                colorColumnType: 'single',
                colorColumn: 'color',
                redColumn: 'red',
                greenColumn: 'green',
                blueColumn: 'blue'
            }
        },
        {
            validMappings: {
                valueColumn: ['Value', 'Red', 'Green', 'Blue'],
                labelColumn: ['Value', 'ClassName', 'Red', 'Green', 'Blue'],
                colorColumn: [],
                redColumn: ['Value', 'Red', 'Green', 'Blue', 'Alpha'],
                greenColumn: ['Value', 'Red', 'Green', 'Blue', 'Alpha'],
                blueColumn: ['Value', 'Red', 'Green', 'Blue', 'Alpha']
            },
            result: {
                valueColumn: 'Value',
                labelColumn: 'ClassName',
                colorColumnType: 'multiple',
                redColumn: 'Red',
                greenColumn: 'Green',
                blueColumn: 'Blue'
            }
        }
    )

describe('a value column', () => {
    it.each([
        ['exponents', ['1e1', '1e2']],
        ['fractions', [1.5, 1.7]],
        ['fractions as text', ['1.5', '1.7']]
    ])('is offered for %s naming different numbers', (_case, values) => {
        expect(getValidMappings(['value'], values.map(value => ({value}))).valueColumn).toEqual(['value'])
    })

    it.each([
        ['the same number, however written', ['1', '1.0']],
        ['text that is no number', ['1', '1abc']],
        ['a blank', ['1', '']]
    ])('is not offered for %s', (_case, values) => {
        expect(getValidMappings(['value'], values.map(value => ({value}))).valueColumn).toEqual([])
    })
})

// A legend as its editors export it - color, value as entered, quoted label - read back as the importer reads it.
describe('an exported legend imported', () => {
    it('offers its value column, holding each value it stated', async () => {
        const csv = 'color,value,label\n#ff0000,1e1,"first"\n#00ff00,1.5,"second"\n#0000ff,1.7,"third"'

        const {columns, rows} = await firstValueFrom(parseCsvFile$(new File([csv], 'legend.csv')))

        expect(getValidMappings(columns, rows).valueColumn).toEqual(['value'])
        expect(rows.map(({value}) => value)).toEqual([10, 1.5, 1.7])
    })
})
