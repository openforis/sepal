import {describe, expect, it} from 'vitest'

import {EvidenceOwners} from './evidenceOwners'

// Runtime access to a recipe's evidence owner: what it reports while registered, and nothing once it is not.

describe('a registered evidence owner', () => {
    it('is read with the basis of the observation it is making, and what it reports of it', () => {
        const owners = new EvidenceOwners()
        const owner = owners.register('alerts-1')
        const basis = {key: 'ASSET:users/x/segments'}

        const observationId = owner.observe({key: 'started'})
        owner.update(observationId, basis)

        expect(owners.ownerOf('alerts-1')).toEqual({observationId, basis})
    })

    it('is not changed by what an observation it has since replaced reports', () => {
        const owners = new EvidenceOwners()
        const owner = owners.register('alerts-1')
        const replaced = owner.observe({key: 'first'})
        const current = owner.observe({key: 'second'})

        owner.update(replaced, {key: 'first resolved'})

        expect(owners.ownerOf('alerts-1')).toEqual({observationId: current, basis: {key: 'second'}})
    })
})

describe('an evidence owner leaving', () => {
    it('is no longer read once released', () => {
        const owners = new EvidenceOwners()
        const owner = owners.register('alerts-1')
        owner.observe({key: 'first'})

        owner.release()

        expect(owners.ownerOf('alerts-1')).toBe(null)
    })

    it('leaves alone an owner that replaced it, and anything it reports late is not kept', () => {
        const owners = new EvidenceOwners()
        const previous = owners.register('alerts-1')
        const late = previous.observe({key: 'previous'})
        const replacement = owners.register('alerts-1')
        const observationId = replacement.observe({key: 'replacement'})

        previous.release()
        previous.update(late, {key: 'previous resolved'})
        previous.observe({key: 'previous again'})

        expect(owners.ownerOf('alerts-1')).toEqual({observationId, basis: {key: 'replacement'}})
    })

    it('is forgotten with the runtime, and an owner registering or reporting afterwards is not kept', () => {
        const owners = new EvidenceOwners()
        const owner = owners.register('alerts-1')
        const observationId = owner.observe({key: 'first'})

        owners.close()
        owner.update(observationId, {key: 'resolved'})
        owners.register('alerts-1').observe({key: 'after close'})

        expect(owners.ownerOf('alerts-1')).toBe(null)
    })
})
