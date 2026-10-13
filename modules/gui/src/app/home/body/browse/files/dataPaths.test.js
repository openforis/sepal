import {describe, expect, it} from 'vitest'

import {isDataPath, splitByOwner, withDataNode} from './dataPaths'

describe('isDataPath', () => {
    it('is true for the Data folder and everything below it', () => {
        expect([isDataPath('data'), isDataPath('data/x')]).toEqual([true, true])
    })

    it('is false for other paths, even with a similar name', () => {
        expect([isDataPath(''), isDataPath('datax'), isDataPath('a/data')]).toEqual([false, false, false])
    })
})

describe('withDataNode', () => {
    it('adds the Data folder to the home listing', () => {
        expect(withDataNode('', {a: {dir: true}})).toEqual({a: {dir: true}, data: {dir: true}})
    })

    it('replaces whatever else is listed as data in the home listing', () => {
        expect(withDataNode('', {data: {file: true, size: 1, mtime: 2}})).toEqual({data: {dir: true}})
    })

    it('leaves the listing of any other folder unchanged', () => {
        const items = {a: {dir: true}}

        expect(withDataNode('downloads', items)).toBe(items)
    })
})

describe('splitByOwner', () => {
    it('separates the paths served by user-data from the others', () => {
        expect(splitByOwner(['', 'downloads', 'data', 'data/x'])).toEqual({
            files: ['', 'downloads'],
            data: ['data', 'data/x']
        })
    })
})
