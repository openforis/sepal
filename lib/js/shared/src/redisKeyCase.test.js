import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {applyKeyNormalization, planKeyNormalization} from './redisKeyCase.js'

const plan = (keys, options) => planKeyNormalization(keys, {prefix: 'user', ...options})

describe('planKeyNormalization', () => {
    it('leaves keys already in their stored spelling alone', () => {
        assert.deepEqual(plan(['user:alice', 'user:bob']), {remove: [], rename: []})
    })

    it('removes a mixed-case key whose stored spelling is also present', () => {
        assert.deepEqual(plan(['user:Alice', 'user:alice']), {
            remove: ['user:Alice'],
            rename: []
        })
    })

    it('renames a mixed-case key whose stored spelling is missing', () => {
        assert.deepEqual(plan(['user:Alice']), {
            remove: [],
            rename: [{from: 'user:Alice', to: 'user:alice'}]
        })
    })

    it('removes rather than renames when orphans are not worth keeping', () => {
        assert.deepEqual(plan(['user:Alice'], {orphans: 'remove'}), {
            remove: ['user:Alice'],
            rename: []
        })
    })

    it('removes every mixed-case spelling when the stored one is present', () => {
        assert.deepEqual(plan(['user:Alice', 'user:ALICE', 'user:alice']), {
            remove: ['user:ALICE', 'user:Alice'],
            rename: []
        })
    })

    it('renames the last spelling and removes the rest when several collide with no stored key', () => {
        assert.deepEqual(plan(['user:Alice', 'user:ALICE']), {
            remove: ['user:ALICE'],
            rename: [{from: 'user:Alice', to: 'user:alice'}]
        })
    })

    it('ignores keys belonging to another prefix', () => {
        assert.deepEqual(plan(['assets:Alice', 'user:Alice']), {
            remove: [],
            rename: [{from: 'user:Alice', to: 'user:alice'}]
        })
    })

    it('ignores the prefix itself and keys without a name', () => {
        assert.deepEqual(plan(['user', 'user:']), {remove: [], rename: []})
    })

    it('separates prefix from name on the given separator', () => {
        assert.deepEqual(
            planKeyNormalization(['job-Alice-mark', 'job-bob-mark'], {prefix: 'job', separator: '-'}),
            {
                remove: [],
                rename: [{from: 'job-Alice-mark', to: 'job-alice-mark'}]
            }
        )
    })

    it('keeps names containing a colon intact', () => {
        assert.deepEqual(plan(['user:Ann:Lee']), {
            remove: [],
            rename: [{from: 'user:Ann:Lee', to: 'user:ann:lee'}]
        })
    })
})

describe('applyKeyNormalization', () => {
    const apply = (keys, options = {}) => {
        const renameCalls = []
        const removeCalls = []
        return applyKeyNormalization(keys, {
            prefix: 'user',
            renameKey: async (from, to) => {
                renameCalls.push([from, to])
                return !options.renameFails
            },
            removeKeys: async keys => removeCalls.push(keys),
            ...options
        }).then(counts => ({counts, renameCalls, removeCalls}))
    }

    it('does nothing when every key is already in its stored spelling', async () => {
        const {counts, renameCalls, removeCalls} = await apply(['user:alice'])
        assert.deepEqual(counts, {removed: 0, renamed: 0})
        assert.deepEqual(renameCalls, [])
        assert.deepEqual(removeCalls, [])
    })

    it('renames orphans and removes duplicates', async () => {
        const {counts, renameCalls, removeCalls} = await apply(['user:Alice', 'user:Bob', 'user:bob'])
        assert.deepEqual(counts, {removed: 1, renamed: 1})
        assert.deepEqual(renameCalls, [['user:Alice', 'user:alice']])
        assert.deepEqual(removeCalls, [['user:Bob']])
    })

    it('removes the source when the stored spelling appeared since the scan', async () => {
        const {counts, renameCalls, removeCalls} = await apply(['user:Alice'], {renameFails: true})
        assert.deepEqual(counts, {removed: 1, renamed: 0})
        assert.deepEqual(renameCalls, [['user:Alice', 'user:alice']])
        assert.deepEqual(removeCalls, [['user:Alice']])
    })

    it('removes in batches', async () => {
        const keys = Array.from({length: 5}, (_, i) => `user:User${i}`)
        const {removeCalls} = await apply([...keys, ...keys.map(key => key.toLowerCase())], {batchSize: 2})
        assert.deepEqual(removeCalls, [
            ['user:User0', 'user:User1'],
            ['user:User2', 'user:User3'],
            ['user:User4']
        ])
    })

    it('refuses to rename without a way to rename', async () => {
        await assert.rejects(applyKeyNormalization(['user:Alice'], {
            prefix: 'user',
            removeKeys: async () => {}
        }), /renameKey/)
    })
})
