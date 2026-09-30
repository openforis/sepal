import {describe, expect, it} from 'vitest'

const {createSaveCoordinator} = await import('./saveCoordinator')
const {draftAgreement} = await import('./draftAgreement')

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
    const published = []
    const clock = fakeClock()
    const coordinator = createSaveCoordinator({
        save: saves.fn,
        loadRecipe: loads.fn,
        onOutcome: outcome => outcomes.push(outcome),
        onState: (recipeId, state) => published.push({recipeId, ...state}),
        clock
    })
    return {saves: saves.calls, loads: loads.calls, outcomes, published, clock, coordinator}
}

// Time moves only when a test says so, firing whatever came due.
const fakeClock = () => {
    let now = 0
    let timers = []
    return {
        now: () => now,
        setTimeout: (callback, ms) => {
            const timer = {at: now + ms, callback}
            timers.push(timer)
            return timer
        },
        clearTimeout: timer => timers = timers.filter(other => other !== timer),
        advance: ms => {
            now += ms
            const due = timers.filter(({at}) => at <= now)
            timers = timers.filter(timer => !due.includes(timer))
            due.forEach(({callback}) => callback())
        }
    }
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

// What is published as persisted, and whether a draft is it (draftAgreement.js). A state is published after each
// transition, so no subscriber can see one step of it.
describe('what a draft agrees with', () => {
    const latest = published => published.at(-1)
    const agreement = (published, draft, knownRevision) =>
        draftAgreement({draft, saveState: latest(published), knownRevision})

    it('is the content loaded when the recipe was opened, at its revision', () => {
        const {published, coordinator} = setup()
        const opened = recipe('a', 'A')

        coordinator.open('a', 4, opened.model)

        expect(latest(published)).toMatchObject({status: 'SAVED', model: opened.model, revision: 4})
        expect(agreement(published, opened)).toBe('AGREED')
    })

    it('waits for an edit queued when the one before it is acknowledged, never reporting that edit as saved', async () => {
        const {saves, published, coordinator} = setup()
        const [first, second] = [recipe('a', 'A'), recipe('a', 'B')]
        coordinator.open('a', 4, recipe('a', 'OPENED').model)
        coordinator.save(first)
        coordinator.save(second)

        await ack(saves[0], 5)

        expect(latest(published)).toMatchObject({status: 'SAVING', model: first.model, revision: 5})
        expect(published.filter(({status}) => status === 'SAVED').map(({revision}) => revision)).toEqual([4])
        expect(agreement(published, second)).toBe('SAVE_PENDING')

        await ack(saves[1], 6)

        expect(latest(published)).toMatchObject({status: 'SAVED', model: second.model, revision: 6})
        expect(agreement(published, second)).toBe('AGREED')
    })

    it('is a new model object holding the same content, which the autosave has nothing to save for', () => {
        const {published, coordinator} = setup()
        const opened = recipe('a', 'A')
        coordinator.open('a', 4, opened.model)
        const replaced = recipe('a', 'A')

        coordinator.equivalent('a', opened.model, replaced.model)

        expect(agreement(published, replaced)).toBe('AGREED')
    })

    it('is content whose acknowledgement was lost, once storage shows it landed', async () => {
        const {saves, loads, published, coordinator} = setup()
        const sent = recipe('a', 'A')
        coordinator.open('a', 4, recipe('a', 'OPENED').model)
        coordinator.save(sent)

        await fail(saves[0], 503)
        expect(agreement(published, sent)).toBe('SAVE_PENDING')
        await loaded(loads[0], sent, 5)

        expect(latest(published)).toMatchObject({status: 'SAVED', model: sent.model, revision: 5})
        expect(agreement(published, sent)).toBe('AGREED')
    })

    it('is not content that was refused, even once nothing is left to send', async () => {
        const {saves, published, coordinator} = setup()
        const refused = recipe('a', 'A')
        coordinator.open('a', 4, recipe('a', 'OPENED').model)
        coordinator.save(refused)

        await fail(saves[0], 400)

        expect(latest(published)).toMatchObject({status: 'FAILED', revision: 4})
        expect(agreement(published, refused)).toBe('SAVE_FAILED')
    })

    it('tells a confirmed conflict from a save that could not be resolved', async () => {
        const conflicted = setup()
        conflicted.coordinator.open('a', 4, recipe('a', 'OPENED').model)
        conflicted.coordinator.save(recipe('a', 'A'))
        await fail(conflicted.saves[0], 412)
        await loaded(conflicted.loads[0], recipe('a', 'THEIRS'), 5)

        const unresolved = setup()
        unresolved.coordinator.open('a', 4, recipe('a', 'OPENED').model)
        unresolved.coordinator.save(recipe('a', 'A'))
        for (let attempt = 0; attempt < 3; attempt++) {
            await fail(unresolved.saves[attempt], 503)
            await loaded(unresolved.loads[attempt], recipe('a', 'OLD'), 4)
        }

        expect(agreement(conflicted.published, recipe('a', 'A'))).toBe('SAVE_CONFLICT')
        expect(agreement(unresolved.published, recipe('a', 'A'))).toBe('SAVE_UNRESOLVED')
    })

    it('is not a draft storage holds a newer revision of', () => {
        const {published, coordinator} = setup()
        const opened = recipe('a', 'A')
        coordinator.open('a', 4, opened.model)

        expect(agreement(published, opened, 5)).toBe('REMOTE_NEWER')
    })
})

describe('a save waiting longer than the bound', () => {
    const waiting = () => {
        const context = setup()
        context.coordinator.open('a', 4, recipe('a', 'OPENED').model)
        context.coordinator.save(recipe('a', 'A'))
        return context
    }

    it('is reported unconfirmed, and nothing is cancelled, retried or given up', async () => {
        const {saves, outcomes, published, clock} = waiting()

        clock.advance(60000)

        expect(published.at(-1)).toMatchObject({status: 'SAVING', unconfirmed: true})
        expect(saves).toHaveLength(1)
        expect(outcomes).toEqual([])
    })

    it('is confirmed by a later acknowledgement', async () => {
        const {saves, published, clock} = waiting()
        clock.advance(60000)

        await ack(saves[0], 5)

        expect(published.at(-1)).toMatchObject({status: 'SAVED', unconfirmed: false, revision: 5})
    })

    it('is timed from the oldest content not yet acknowledged, not from the first edit of a busy session', async () => {
        const {saves, published, clock, coordinator} = waiting()
        clock.advance(40000)
        coordinator.save(recipe('a', 'B'))
        await ack(saves[0], 5)

        clock.advance(40000)

        expect(published.at(-1)).toMatchObject({status: 'SAVING', unconfirmed: false})
        clock.advance(20000)
        expect(published.at(-1)).toMatchObject({status: 'SAVING', unconfirmed: true})
    })
})
