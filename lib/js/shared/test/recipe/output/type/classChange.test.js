import {classTransitions} from '#sepal/recipe/type/classChange'

describe('the code of a class transition', () => {
    test.each([
        ['ascending single-digit classes', [1, 2], [[1, 1, 1], [1, 2, 2], [2, 1, 3], [2, 2, 4]]],
        ['classes whose text order is not their numeric order', [2, 10], [[2, 2, 1], [2, 10, 2], [10, 2, 3], [10, 10, 4]]],
        ['a legend deliberately ordered neither ascending nor as text', [3, 1, 2], [
            [3, 3, 1], [3, 1, 2], [3, 2, 3], [1, 3, 4], [1, 1, 5], [1, 2, 6], [2, 3, 7], [2, 1, 8], [2, 2, 9]
        ]]
    ])('follows the legend\'s entry order, for %s', (_case, values, codes) => {
        const entries = values.map(value => ({value}))

        const transitions = classTransitions(entries, entries)

        expect(transitions.map(({from, to, value}) => [from.value, to.value, value])).toEqual(codes)
    })

    test('leaves the legends as they were', () => {
        const fromEntries = [{value: 10}, {value: 2}]
        const toEntries = [{value: 3}, {value: 1}]

        classTransitions(fromEntries, toEntries)

        expect([fromEntries, toEntries]).toEqual([[{value: 10}, {value: 2}], [{value: 3}, {value: 1}]])
    })
})
