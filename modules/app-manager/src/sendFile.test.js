import assert from 'node:assert/strict'
import {test} from 'node:test'

import {resolveFile} from './sendFile.js'

const ROOT = '/var/lib/sepal/app-manager/images'

test('a file name resolves inside the root', () => {
    assert.equal(resolveFile(ROOT, 'jupyter-lab.png'), `${ROOT}/jupyter-lab.png`)
})

test('a name that climbs out of the root resolves to nothing', () => {
    assert.equal(resolveFile(ROOT, '../../../../../etc/passwd'), null)
})

test('an absolute path resolves to nothing', () => {
    assert.equal(resolveFile(ROOT, '/etc/passwd'), null)
})

test('the root itself resolves to nothing', () => {
    assert.equal(resolveFile(ROOT, '.'), null)
})
