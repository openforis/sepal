const {rewriteLocation} = require('./rewrite')
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

test('location at root', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234',
        location: '/'
    })
    expect(rewritten).toBe('/a/b')
})

test('different host', () => {
    const rewritten = rewriteLocation({
        path: '/a/b',
        target: 'http://domain:1234',
        location: 'http://another:1234/c/d'
    })
    expect(rewritten).toBe('http://another:1234/c/d')
})

