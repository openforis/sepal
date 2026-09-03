import {rewriteLocation} from './rewrite.js'

test('root of target', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234',
        location: '/c/d'
    })
    expect(rewritten).toBe('/a/b/c/d')
})

test('same target and location path', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234/c/d',
        location: '/c/d'
    })
    expect(rewritten).toBe('/a/b')
})

test('deep location path', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234/c/d',
        location: '/c/d/e/f'
    })
    expect(rewritten).toBe('/a/b/e/f')
})

test('location path outside of target', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234/c/d',
        location: '/e/f'
    })
    expect(rewritten).toBe('/a/b/e/f')
})

test('location at root keeps the trailing slash', () => {
    // A root Location must map to path + '/' — landing on the slash-less path breaks the
    // browser's relative-URL resolution (RStudio's post-sign-in redirect to '/').
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234',
        location: '/'
    })
    expect(rewritten).toBe('/a/b/')
})

test('location matching target path with trailing slash keeps it', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234/c/d',
        location: '/c/d/'
    })
    expect(rewritten).toBe('/a/b/')
})

test('different host', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234',
        location: 'http://another:1234/c/d'
    })
    expect(rewritten).toBe('http://another:1234/c/d')
})

