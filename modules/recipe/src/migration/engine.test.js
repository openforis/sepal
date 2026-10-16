import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {currentVersion, migrate} from './engine.js'

describe('currentVersion', () => {
    test('is the highest version a type declares, and 1 when it declares none', () => {
        assert.equal(currentVersion(migrations), 7)
        assert.equal(currentVersion({}), 1)
    })
})

describe('migrate', () => {
    test('lifts a recipe through every version above its own, in order', () => {
        const migrated = migrate({base: true}, 0, migrations)

        assert.deepEqual(migrated.contents, {base: true, e: 5, g: 7})
        assert.equal(migrated.typeVersion, 7)
    })

    test('leaves out the versions a recipe is already past', () => {
        const migrated = migrate({base: true}, 5, migrations)

        assert.deepEqual(migrated.contents, {base: true, g: 7})
        assert.equal(migrated.typeVersion, 7)
    })

    test('pins the version without changing the recipe at a baseline entry', () => {
        const migrated = migrate({base: true}, 5, {5: false})

        assert.deepEqual(migrated.contents, {base: true})
        assert.equal(migrated.typeVersion, 5)
    })

    test('skips a baseline between versions without stopping the migrations after it', () => {
        const migrated = migrate({base: true}, 4, {5: false, 6: recipe => ({...recipe, f: 6})})

        assert.deepEqual(migrated.contents, {base: true, f: 6})
        assert.equal(migrated.typeVersion, 6)
    })

    test('lets a migration replace the recipe entirely', () => {
        const migrated = migrate({old: true}, 0, {6: () => ({replaced: true})})

        assert.deepEqual(migrated.contents, {replaced: true})
    })
})

const migrations = {
    5: recipe => ({...recipe, e: 5}),
    7: recipe => ({...recipe, g: 7})
}
