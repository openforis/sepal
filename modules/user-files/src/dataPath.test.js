import {isDataPath} from './dataPath.js'

describe('isDataPath', () => {
    it.each(['data', 'data/x', '/data', './data/x', 'a/../data/x'])(
        'is true for %j, which lies in the home\'s data folder',
        path => expect(isDataPath(path)).toBe(true)
    )

    it.each(['datax', 'x/data', 'downloads', ''])(
        'is false for %j, which lies outside the home\'s data folder',
        path => expect(isDataPath(path)).toBe(false)
    )
})
