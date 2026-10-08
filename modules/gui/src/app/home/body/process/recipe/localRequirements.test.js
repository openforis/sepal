import {describe, expect, it, vi} from 'vitest'

// Requirements a recipe type declares over its own configuration, as the shared reader reads them beside those over its
// sources: judged from the recipe alone, each item by declaration and item id, and held by what it depends on.

vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

const {readKey, readSourceRequirements, requestGate} = await import('./sourceRequirements')
const {itemStatusesOf, sectionStatusOf, UNMET_CONFIGURATION} = await import('./selectedSourceStatus')

describe('a local requirement', () => {
    it('is checked from the recipe alone, selecting nothing', () => {
        const [read] = readsOf(recipe({items: [item('a')]}))

        expect(read).toMatchObject({local: true, acquisition: 'CHECKED', item: {id: 'a', path: ['items', {id: 'a'}]}})
        expect(read).not.toHaveProperty('selected')
    })

    it('without items is judged once, for its section', () => {
        registry.SECTION = {sourceRequirements: [{
            id: 'section', section: SECTION, requirement: REQUIREMENT, localFacts: ({model}) => ({ok: model.ok}), operations: ['OUTPUT']
        }]}

        expect(readsOf({id: 'r', type: 'SECTION', model: {ok: false}}).map(({item, verdict}) => [item, verdict.status]))
            .toEqual([[null, 'UNSUPPORTED']])
    })

    it('depending on an item that was never read is not met', () => {
        const reads = readsOf(recipe({items: [item('a', {needs: ['gone']})]}))

        expect(effective(reads, 'a')).toEqual({own: 'SUPPORTED', status: 'UNSUPPORTED', unmet: [['items|gone', false]]})
    })

    it('depending on itself through another is not met', () => {
        const reads = readsOf(recipe({items: [item('a', {needs: ['b']}), item('b', {needs: ['a']})]}))

        expect(effective(reads, 'a').status).toBe('UNSUPPORTED')
        expect(effective(reads, 'b').status).toBe('UNSUPPORTED')
    })

    it('keeps its own problems apart from the item it depends on', () => {
        const reads = readsOf(recipe({items: [item('a', {ok: false}), item('b', {ok: false, needs: ['a']})]}))

        expect(effective(reads, 'b')).toEqual({own: 'UNSUPPORTED', status: 'UNSUPPORTED', unmet: [['items|a', true]]})
        expect(reads.find(read => readKey(read) === 'items|b').verdict.diagnostic).toEqual({code: 'BROKEN'})
    })

    it('met itself and depending only on met items is met', () => {
        const reads = readsOf(recipe({items: [item('a'), item('b', {needs: ['a']})]}))

        expect(effective(reads, 'b')).toEqual({own: 'SUPPORTED', status: 'SUPPORTED', unmet: []})
    })
})

describe('an operation a local requirement holds', () => {
    it('is refused, withdrawing what is drawn, while an item is unmet, even one unmet only by what it depends on', () => {
        const model = recipe({items: [item('a', {ok: false}), item('b', {needs: ['a']})], operations: ['OUTPUT']})

        expect(requestGate({state: {}, recipe: model, operation: 'OUTPUT'}))
            .toMatchObject({code: 'CONFIGURATION_UNMET', wait: false, withdraw: true, section: SECTION.label})
    })

    it('is not refused for another operation', () => {
        expect(requestGate({state: {}, recipe: recipe({items: [item('a', {ok: false})]}), operation: 'OTHER'})).toBe(null)
    })
})

describe('what a section says', () => {
    it('is held back by its items\' own problems, naming the item', () => {
        const status = sectionStatusOf({}, readsOf(recipe({items: [item('a'), item('b', {ok: false})]})), SECTION.id)

        expect(status).toMatchObject({state: UNMET_CONFIGURATION})
        expect(status.message).toContain('"item":"Item b"')
    })

    it('is held back by an item unmet only by what it depends on, naming the item and what it depends on alone', () => {
        registry.OTHER = {sourceRequirements: [
            declaration({id: 'first', section: SECTION, items: [item('a', {ok: false})]}),
            declaration({id: 'second', section: OTHER_SECTION, items: [item('b', {needs: ['a'], from: 'first'})]})
        ]}
        const reads = readsOf({id: 'r', type: 'OTHER', model: {}})

        const status = sectionStatusOf({}, reads, OTHER_SECTION.id)
        expect(status).toEqual(expect.objectContaining({state: UNMET_CONFIGURATION, details: []}))
        expect(status.message).toContain('Item b')
        expect(status.message).toContain('Item a')
        expect(status.message).not.toContain('BROKEN')
        expect(itemStatusesOf(reads, OTHER_SECTION.id)).toEqual({b: expect.objectContaining({state: UNMET_CONFIGURATION})})
    })

    it('says what an item finds itself before what another is held by', () => {
        registry.OTHER = {sourceRequirements: [
            declaration({id: 'first', section: SECTION, items: [item('a', {ok: false}), item('b', {needs: ['a'], from: 'first'})]})
        ]}
        const reads = readsOf({id: 'r', type: 'OTHER', model: {}})

        const status = sectionStatusOf({}, reads, SECTION.id)
        expect(status.message).toContain('BROKEN')
        expect(status.details).toEqual([expect.stringContaining('Item b')])
    })
})

const SECTION = {id: 'items', label: 'items.label'}
const OTHER_SECTION = {id: 'others', label: 'others.label'}

const REQUIREMENT = {
    id: 'test.items',
    evaluate: ({ok}) => ok === false ? {status: 'UNSUPPORTED', diagnostic: {code: 'BROKEN'}} : {status: 'SUPPORTED'},
    describe: ({code}) => ({message: code, details: []})
}

function item(id, {ok = true, needs = [], from = 'items'} = {}) {
    return {
        id, path: ['items', {id}], label: `Item ${id}`, facts: {ok},
        prerequisites: needs.map(item => ({declaration: from, item}))
    }
}

function declaration({id, section, items, operations = ['OUTPUT']}) {
    return {id, section, requirement: REQUIREMENT, localFacts: () => ({}), items: () => items, operations}
}

function recipe({items, operations}) {
    registry.ITEMS = {sourceRequirements: [declaration({id: 'items', section: SECTION, items, operations})]}
    return {id: 'r', type: 'ITEMS', model: {}}
}

function readsOf(recipe) {
    return readSourceRequirements({state: {}, recipe})
}

function effective(reads, id) {
    const read = reads.find(read => read.item.id === id)
    return {
        own: read.ownVerdict.status,
        status: read.verdict.status,
        unmet: read.unmetPrerequisites.map(({declaration, item, read}) => [`${declaration}|${item}`, read])
    }
}
