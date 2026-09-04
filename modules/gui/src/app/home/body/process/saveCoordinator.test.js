import {describe, expect, it} from 'vitest'

const {createSaveCoordinator} = await import('./saveCoordinator')

const controllable = () => {
    const calls = []
    const fn = request => new Promise((resolve, reject) => calls.push({request, resolve, reject}))
    return {calls, fn}
}

const recipe = (id, content) => ({id, model: {content}})

const setup = () => {
    const saves = controllable()
    const loads = controllable()
    const outcomes = []
    const coordinator = createSaveCoordinator({
        save: saves.fn, loadRecipe: loads.fn, onOutcome: outcome => outcomes.push(outcome)
    })
    return {saves: saves.calls, loads: loads.calls, outcomes, coordinator}
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const ack = async (call, revision) => {
    call.resolve({revision})
    await flush()
}
const fail = async (call, status) => {
    call.reject(Object.assign(new Error('failed'), {status}))
    await flush()
}
// Recovery reads an ordinary recipe: the revision travels inside it.
const loaded = async (call, recipe, revision) => {
    call.resolve({...recipe, revision})
    await flush()
}
const contents = calls => calls.map(({request}) => request.recipe.model.content)

describe('coalescing', () => {
    it('sends A then C, dropping the B that C superseded, with C against A\'s acknowledged revision', async () => {
        const {saves, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        coordinator.save(recipe('a', 'B'))
        coordinator.save(recipe('a', 'C'))
        await ack(saves[0], 5)

        expect(contents(saves)).toEqual(['A', 'C'])
        expect(saves.map(({request}) => request.expectedRevision)).toEqual([4, 5])
    })

    it('creates without an expected revision', async () => {
        const {saves, coordinator} = setup()
        coordinator.save(recipe('a', 'A'))
        await flush()
        expect(saves[0].request.expectedRevision).toBeUndefined()
    })
})

describe('independence', () => {
    it('lets one recipe proceed while another is refused', async () => {
        const {saves, outcomes, coordinator} = setup()
        coordinator.save(recipe('a', 1))
        coordinator.save(recipe('b', 1))
        await fail(saves.find(({request}) => request.recipe.id === 'a'), 400)
        coordinator.save(recipe('b', 2))
        await ack(saves.find(({request}) => request.recipe.id === 'b'), 1)

        expect(outcomes).toContainEqual(expect.objectContaining({recipeId: 'a', status: 'FAILED'}))
        expect(saves.filter(({request}) => request.recipe.id === 'b')).toHaveLength(2)
    })
})

describe('lost acknowledgement', () => {
    it('recovers from a 412 by adopting the revision of content that turns out to be its own', async () => {
        const {saves, loads, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        coordinator.save(recipe('a', 'C'))
        await fail(saves[0], 412)
        await loaded(loads[0], recipe('a', 'A'), 5)

        expect(contents(saves)).toEqual(['A', 'C'])
        expect(saves[1].request.expectedRevision).toBe(5)
    })

    it('compares what was actually sent, so an undefined-valued key does not look like a difference', async () => {
        const {saves, loads, outcomes, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save({id: 'a', model: {content: 'A', unset: undefined}})
        await fail(saves[0], 412)
        await loaded(loads[0], {id: 'a', model: {content: 'A'}}, 5)

        expect(outcomes).toContainEqual(expect.objectContaining({status: 'SAVED', revision: 5}))
    })

    it('does not trust an acknowledgement without a revision', async () => {
        const {saves, loads, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        await ack(saves[0], undefined)
        await loaded(loads[0], recipe('a', 'A'), 5)
        coordinator.save(recipe('a', 'C'))
        await flush()

        expect(saves[1].request.expectedRevision).toBe(5)
    })
})

// Project placement changing cannot determine whether recipe content was saved.
describe('project placement', () => {
    it('is excluded from recovery comparison', async () => {
        const {saves, loads, outcomes, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save({id: 'a', projectId: null, model: {content: 'A'}})
        await fail(saves[0], 412)
        await loaded(loads[0], {id: 'a', projectId: 'p2', model: {content: 'A'}}, 5)

        expect(outcomes).toContainEqual(expect.objectContaining({status: 'SAVED', revision: 5}))
    })
})

// Pending callbacks retain old state objects after open or forget replaces their generation.
describe('superseded generations', () => {
    it('drops a late failure for a recipe that has since been reopened', async () => {
        const {saves, loads, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        await flush()
        coordinator.open('a', 9)
        await fail(saves[0], 503)

        expect(loads).toHaveLength(0)
        expect(saves).toHaveLength(1)
    })

    it('drops a late failure for a recipe that has since been forgotten', async () => {
        const {saves, loads, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        await flush()
        coordinator.forget('a')
        await fail(saves[0], 503)

        expect(loads).toHaveLength(0)
    })

    it('drops a recovery that resolves after the recipe was reopened', async () => {
        const {saves, loads, outcomes, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        await fail(saves[0], 503)
        coordinator.open('a', 9)
        await loaded(loads[0], recipe('a', 'A'), 5)

        expect(saves).toHaveLength(1)
        expect(outcomes).not.toContainEqual(expect.objectContaining({status: 'SAVED'}))
    })
})

describe('genuine conflict', () => {
    const conflicted = async () => {
        const context = setup()
        context.coordinator.open('a', 4)
        context.coordinator.save(recipe('a', 'A'))
        await fail(context.saves[0], 412)
        await loaded(context.loads[0], recipe('a', 'THEIRS'), 5)
        return context
    }

    it('latches and transmits nothing more', async () => {
        const {saves, outcomes, coordinator} = await conflicted()
        coordinator.save(recipe('a', 'C'))
        await flush()

        expect(outcomes).toContainEqual(expect.objectContaining({recipeId: 'a', status: 'CONFLICT'}))
        expect(saves).toHaveLength(1)
    })

    it('is released only by opening the recipe afresh', async () => {
        const {saves, coordinator} = await conflicted()
        coordinator.open('a', 5)
        coordinator.save(recipe('a', 'C'))
        await flush()

        expect(saves).toHaveLength(2)
        expect(saves[1].request.expectedRevision).toBe(5)
    })
})

describe('ambiguous failure', () => {
    it('retries the same payload against the same revision when nothing was committed', async () => {
        const {saves, loads, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        await fail(saves[0], 503)
        await loaded(loads[0], recipe('a', 'OLD'), 4)

        expect(saves).toHaveLength(2)
        expect(saves[1].request).toEqual(expect.objectContaining({recipe: recipe('a', 'A'), expectedRevision: 4}))
    })

    it('adopts the revision when the write turns out to have landed', async () => {
        const {saves, loads, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        await fail(saves[0], undefined)
        await loaded(loads[0], recipe('a', 'A'), 5)
        coordinator.save(recipe('a', 'C'))
        await flush()

        expect(saves[1].request.expectedRevision).toBe(5)
    })

    it('gives up after a bounded number of attempts rather than looping', async () => {
        const {saves, loads, outcomes, coordinator} = setup()
        coordinator.open('a', 4)
        coordinator.save(recipe('a', 'A'))
        for (let attempt = 0; attempt < 3; attempt++) {
            await fail(saves[attempt], 503)
            await loaded(loads[attempt], recipe('a', 'OLD'), 4)
        }
        coordinator.save(recipe('a', 'C'))
        await flush()

        expect(saves).toHaveLength(3)
        expect(outcomes).toContainEqual(expect.objectContaining({recipeId: 'a', status: 'UNRESOLVED'}))
    })
})
