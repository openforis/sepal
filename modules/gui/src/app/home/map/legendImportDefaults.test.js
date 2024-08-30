import _ from 'lodash'

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
