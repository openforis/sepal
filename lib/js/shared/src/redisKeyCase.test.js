import {applyKeyNormalization, planKeyNormalization} from './redisKeyCase.js'

const plan = (keys, options) => planKeyNormalization(keys, {prefix: 'user', ...options})

describe('planKeyNormalization', () => {
    it('leaves keys already in their stored spelling alone', () => {
        expect(plan(['user:alice', 'user:bob'])).toEqual({remove: [], rename: []})
    })

    it('removes a mixed-case key whose stored spelling is also present', () => {
        expect(plan(['user:Alice', 'user:alice'])).toEqual({
            remove: ['user:Alice'],
            rename: []
        })
    })

    it('renames a mixed-case key whose stored spelling is missing', () => {
        expect(plan(['user:Alice'])).toEqual({
            remove: [],
            rename: [{from: 'user:Alice', to: 'user:alice'}]
        })
    })

    it('removes rather than renames when orphans are not worth keeping', () => {
        expect(plan(['user:Alice'], {orphans: 'remove'})).toEqual({
            remove: ['user:Alice'],
            rename: []
        })
    })

    it('removes every mixed-case spelling when the stored one is present', () => {
        expect(plan(['user:Alice', 'user:ALICE', 'user:alice'])).toEqual({
            remove: ['user:ALICE', 'user:Alice'],
            rename: []
        })
    })

    it('renames the last spelling and removes the rest when several collide with no stored key', () => {
        expect(plan(['user:Alice', 'user:ALICE'])).toEqual({
            remove: ['user:ALICE'],
            rename: [{from: 'user:Alice', to: 'user:alice'}]
        })
    })

    it('ignores keys belonging to another prefix', () => {
        expect(plan(['assets:Alice', 'user:Alice'])).toEqual({
            remove: [],
            rename: [{from: 'user:Alice', to: 'user:alice'}]
        })
    })

    it('ignores the prefix itself and keys without a name', () => {
        expect(plan(['user', 'user:'])).toEqual({remove: [], rename: []})
    })

    it('separates prefix from name on the given separator', () => {
        expect(planKeyNormalization(['job-Alice-mark', 'job-bob-mark'], {prefix: 'job', separator: '-'})).toEqual({
            remove: [],
            rename: [{from: 'job-Alice-mark', to: 'job-alice-mark'}]
        })
    })

    it('keeps names containing a colon intact', () => {
        expect(plan(['user:Ann:Lee'])).toEqual({
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
        expect(counts).toEqual({removed: 0, renamed: 0})
        expect(renameCalls).toEqual([])
        expect(removeCalls).toEqual([])
    })

    it('renames orphans and removes duplicates', async () => {
        const {counts, renameCalls, removeCalls} = await apply(['user:Alice', 'user:Bob', 'user:bob'])
        expect(counts).toEqual({removed: 1, renamed: 1})
        expect(renameCalls).toEqual([['user:Alice', 'user:alice']])
        expect(removeCalls).toEqual([['user:Bob']])
    })

    it('removes the source when the stored spelling appeared since the scan', async () => {
        const {counts, renameCalls, removeCalls} = await apply(['user:Alice'], {renameFails: true})
        expect(counts).toEqual({removed: 1, renamed: 0})
        expect(renameCalls).toEqual([['user:Alice', 'user:alice']])
        expect(removeCalls).toEqual([['user:Alice']])
    })

    it('removes in batches', async () => {
        const keys = Array.from({length: 5}, (_, i) => `user:User${i}`)
        const {removeCalls} = await apply([...keys, ...keys.map(key => key.toLowerCase())], {batchSize: 2})
        expect(removeCalls).toEqual([
            ['user:User0', 'user:User1'],
            ['user:User2', 'user:User3'],
            ['user:User4']
        ])
    })

    it('refuses to rename without a way to rename', async () => {
        await expect(applyKeyNormalization(['user:Alice'], {
            prefix: 'user',
            removeKeys: async () => {}
        })).rejects.toThrow('renameKey')
    })
})
