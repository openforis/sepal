import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {isRestrictedHomeMount} from './restrictedHome.js'

describe('restricted home mount decision', () => {
    test('requires nosymfollow among the per-mount options', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home/alice', mountInfo: `
10 1 0:1 / / rw - overlay overlay rw
11 10 0:2 / /sepal/home rw,relatime,nosymfollow - nfs4 efs rw
`}), true)
    })

    test('does not accept nosymfollow only in the superblock options', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home', mountInfo: `
10 1 0:1 / / rw - overlay overlay rw
11 10 0:2 / /sepal/home rw,relatime - nfs4 efs rw,nosymfollow
`}), false)
    })

    test('uses the deepest mount instead of an enclosing restricted mount', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home/alice', mountInfo: `
10 1 0:1 / / rw - overlay overlay rw
11 10 0:2 / /sepal rw,nosymfollow - tmpfs tmpfs rw
12 11 0:3 / /sepal/home rw - tmpfs tmpfs rw
`}), false)
    })

    test('accepts a restricted child mount of a normal mount', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home/alice', mountInfo: `
10 1 0:1 / / rw - overlay overlay rw
11 10 0:2 / /sepal/home rw,nosymfollow shared:1 - tmpfs tmpfs rw
`}), true)
    })

    test('matches complete path components rather than a name prefix', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home-other', mountInfo: `
10 1 0:1 / / rw - overlay overlay rw
11 10 0:2 / /sepal/home rw,nosymfollow - tmpfs tmpfs rw
`}), false)
    })

    test('decodes mountinfo escapes in mount-point names', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home with\ttabs\\slashes\n/alice', mountInfo: `
10 1 0:1 / / rw - overlay overlay rw
11 10 0:2 / /sepal/home\\040with\\011tabs\\134slashes\\012 rw,nosymfollow - tmpfs tmpfs rw
`}), true)
    })

    test('recognizes a restricted filesystem mounted at root', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home', mountInfo: `
10 1 0:1 / / rw,nosymfollow - tmpfs tmpfs rw
`}), true)
    })

    test('does not accept a similarly named option', () => {
        assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home', mountInfo: `
10 1 0:1 / / rw,nosymfollowed - tmpfs tmpfs rw
`}), false)
    })

    test('fails closed when equally specific mounts disagree', () => {
        const plain = '11 10 0:2 / /sepal/home rw - tmpfs tmpfs rw'
        const restricted = '12 11 0:2 / /sepal/home rw,nosymfollow - tmpfs tmpfs rw'

        for (const lines of [[plain, restricted], [restricted, plain]]) {
            assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home', mountInfo: lines.join('\n')}), false)
        }
    })

    test('refuses missing or malformed mount information', () => {
        for (const mountInfo of ['', 'not mountinfo', '11 10 0:2 / /sepal/home rw,nosymfollow']) {
            assert.equal(isRestrictedHomeMount({homeDir: '/sepal/home', mountInfo}), false)
        }
    })
})
