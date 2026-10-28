import {describe, expect, it, vi} from 'vitest'

// Requirements a recipe type declares over its own configuration, as the shared reader reads them beside those over its
// sources: judged from the recipe alone, each item by declaration and item id, and held by what it depends on.

// Keep the diagnostic when it is wrapped with an item label, without depending on that label or translated wording.
vi.mock('~/translate', () => ({msg: (key, values) => values?.message || key}))
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
    it('marks only the item with its own problem and its section', () => {
        const reads = readsOf(recipe({items: [item('a'), item('b', {ok: false})]}))

        expect(sectionStatusOf({}, reads, SECTION.id)).toMatchObject({state: UNMET_CONFIGURATION})
        expect(itemStatusesOf(reads, SECTION.id)).toEqual({b: expect.objectContaining({state: UNMET_CONFIGURATION})})
    })

    it('marks only the originating section, while a dependency in another section blocks execution until repaired', () => {
        const broken = item('a', {ok: false})
        registry.OTHER = {sourceRequirements: [
            declaration({id: 'first', section: SECTION, items: [broken]}),
            declaration({id: 'second', section: OTHER_SECTION, items: [item('b', {needs: ['a'], from: 'first'})]})
        ]}
        const model = {id: 'r', type: 'OTHER', model: {}}
        const reads = readsOf(model)

        expect(sectionStatusOf({}, reads, SECTION.id)).toMatchObject({state: UNMET_CONFIGURATION})
        expect(itemStatusesOf(reads, SECTION.id)).toEqual({a: expect.objectContaining({state: UNMET_CONFIGURATION})})
        expect(sectionStatusOf({}, reads, OTHER_SECTION.id)).toBeNull()
        expect(itemStatusesOf(reads, OTHER_SECTION.id)).toEqual({})
        expect(effective(reads, 'b')).toEqual({own: 'SUPPORTED', status: 'UNSUPPORTED', unmet: [['first|a', true]]})
        expect(requestGate({state: {}, recipe: model, operation: 'OUTPUT'})).toMatchObject({
            code: 'CONFIGURATION_UNMET', wait: false, withdraw: true,
            read: {declaration: {id: 'first'}, item: {id: 'a'}}
        })

        broken.facts.ok = true
        const repaired = {...model}
        const repairedReads = readsOf(repaired)

        for (const section of [SECTION, OTHER_SECTION]) {
            expect(sectionStatusOf({}, repairedReads, section.id)).toBeNull()
            expect(itemStatusesOf(repairedReads, section.id)).toEqual({})
        }
        expect(effective(repairedReads, 'b')).toEqual({own: 'SUPPORTED', status: 'SUPPORTED', unmet: []})
        expect(requestGate({state: {}, recipe: repaired, operation: 'OUTPUT'})).toBeNull()
    })

    it('says what an item finds itself before what another is held by', () => {
        registry.OTHER = {sourceRequirements: [
            declaration({id: 'first', section: SECTION, items: [item('a', {ok: false}), item('b', {needs: ['a'], from: 'first'})]})
        ]}
        const reads = readsOf({id: 'r', type: 'OTHER', model: {}})

        const status = sectionStatusOf({}, reads, SECTION.id)
        expect(status.message).toBe('BROKEN')
        expect(status.details).toHaveLength(1)
        expect(itemStatusesOf(reads, SECTION.id)).toMatchObject({
            a: {state: UNMET_CONFIGURATION}, b: {state: UNMET_CONFIGURATION}
        })
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
