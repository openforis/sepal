// Unit tests for the derived instance name.
//
// The name is a pure function of the session id, which is what lets every surface — the GUI list,
// the expiry notification, the email, its management page and the SSH menu — arrive at the same
// name without anything being stored or passed around.

import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {ADJECTIVES, instanceName, NOUNS} from './instanceName.js'

describe('instanceName', () => {
    const id = '25a02f1c-9e59-491e-b5ac-80b95dcc274e'

    test('is two lowercase words joined by a hyphen', () => {
        assert.match(instanceName(id), /^[a-z]+-[a-z]+$/)
    })

    // The whole reason nothing is persisted: the same session always derives the same name, so a
    // name quoted in an email still matches the one on screen an hour later, across restarts.
    test('is stable for a given session id', () => {
        assert.equal(instanceName(id), instanceName(id))
    })

    test('differs between sessions', () => {
        const other = '3f0b1d77-2c14-4a91-9c33-71f0aa5e1b02'
        assert.notEqual(instanceName(id), instanceName(other))
    })

    // Every surface falls back to something honest rather than rendering half a name.
    for (const [name, value] of [['null', null], ['undefined', undefined], ['empty', ''], ['a number', 42]]) {
        test(`${name} → null, never a throw`, () => {
            assert.equal(instanceName(value), null)
        })
    }

    test('draws on the whole space, not a corner of it', () => {
        const names = new Set(
            Array.from({length: 2000}, (_, i) => instanceName(`session-${i}`))
        )
        // Distinct names from 2000 distinct ids: a hash that collapsed onto a few words — or
        // ignored half the digest — would show up here as a much smaller set.
        assert.ok(names.size > 1900)
    })
})

// The collision odds quoted in the design assume these are big and duplicate-free. A word
// accidentally listed twice silently shrinks the space and biases the draw.
describe('the word lists', () => {
    for (const [name, get] of [['adjectives', () => ADJECTIVES], ['nouns', () => NOUNS]]) {
        test(`${name} are duplicate-free and large enough`, () => {
            const words = get()
            assert.ok(words.length >= 150)
            assert.equal(new Set(words).size, words.length)
            words.forEach(word => assert.match(word, /^[a-z]+$/))
        })
    }
})
