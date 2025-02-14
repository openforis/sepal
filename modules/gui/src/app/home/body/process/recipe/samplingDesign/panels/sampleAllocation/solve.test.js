import {findRoot} from './solve'

it('can find root of linear function', () => {
    expect(findRoot({
        fun: x => x - 4,
        min: 0,
        max: 10
    })).toEqual(4)
})
