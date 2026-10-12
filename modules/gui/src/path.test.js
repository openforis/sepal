import Path from 'node:path'

import {dirname, extname} from './path'

describe('dirname', () => {
    it('returns the path up to the last segment', () => {
        expect(dirname('projects/my-project/assets/mosaic')).toEqual('projects/my-project/assets')
    })

    it('ignores trailing slashes', () => {
        expect(dirname('downloads/mosaic/')).toEqual('downloads')
    })

    it('returns . for a relative path without a parent', () => {
        expect(dirname('mosaic')).toEqual('.')
    })

    it('returns / for an absolute path without a parent', () => {
        expect(dirname('/mosaic')).toEqual('/')
    })

    it('matches Node for every short path', () => {
        allPaths().forEach(path =>
            expect([path, dirname(path)]).toEqual([path, Path.posix.dirname(path)])
        )
    })
})

describe('extname', () => {
    it('returns the extension of the last segment, including the dot', () => {
        expect(extname('downloads/mosaic.tif')).toEqual('.tif')
    })

    it('returns only the last extension', () => {
        expect(extname('archive.tar.gz')).toEqual('.gz')
    })

    it('does not treat leading dots as an extension', () => {
        expect(extname('.bashrc')).toEqual('')
    })

    it('matches Node for every short path', () => {
        allPaths().forEach(path =>
            expect([path, extname(path)]).toEqual([path, Path.posix.extname(path)])
        )
    })
})

const allPaths = (maxLength = 7) => {
    const extend = paths => paths.flatMap(path => ['a', '.', '/'].map(c => path + c))
    const paths = [['']]
    for (let length = 1; length <= maxLength; length++) {
        paths.push(extend(paths[length - 1]))
    }
    return paths.flat()
}
