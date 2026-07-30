import {findRoot} from './solve'

it('finds the first integer at an integer decreasing crossing', () => {
    expect(findRoot({fun: x => 10 - x, min: 0, max: 20})).toEqual(10)
})

it('finds the first integer below a non-integer decreasing crossing', () => {
    // 10.1 - x first dips to/below 0 at x = 11 (10 still leaves 0.1 > 0)
    expect(findRoot({fun: x => 10.1 - x, min: 0, max: 100})).toEqual(11)
})

it('returns max when the target is unreachable within the range', () => {
    expect(findRoot({fun: x => 100 - x, min: 0, max: 10})).toEqual(10)
})

it('returns min when the target is already met at min', () => {
    expect(findRoot({fun: x => -1 - x, min: 0, max: 10})).toEqual(0)
})

it('propagates NaN rather than looping', () => {
    expect(findRoot({fun: () => NaN, min: 0, max: 10})).toBeNaN()
})
