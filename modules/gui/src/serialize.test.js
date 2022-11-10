import {HASH_KEY, cloneDeep, deserialize, isEqual, serialize} from 'serialize'
import _ from 'lodash'

/* eslint-disable no-undef */

it('serialize-deserialize-non-hashed', () => {
    const original = [1, 2, 3]
    const serialized = serialize(original)
    const deserialized = deserialize(serialized)
    expect(deserialized).toEqual(original)
})

it('serialize-deserialize-hashed', () => {
    const original = [1, 2, 3]
    original[HASH_KEY] = '123'
    const serialized = serialize(original)
    const deserialized = deserialize(serialized)
    expect(deserialized).toEqual(original)
})

it('cloneDeep-isEqual', () => {
    const hashedArray = [1, {nestedString: 'nested'}, 3]
    hashedArray[HASH_KEY] = 'arrayhash'
    const nonHashedArray = [2, {inner: 'inner'}]
    const object = {
        hashedArray,
        nonHashedArray,
        n: 1,
        foo: 'bar',
        object: {
            foo: 'foo',
            bar: 'bar',
            array: ['x', 'y', 'z'],
            [HASH_KEY]: 'objecthash'
        }
    }
    const clone = cloneDeep(object)
    expect(isEqual(object, clone)).toBe(true)
})
