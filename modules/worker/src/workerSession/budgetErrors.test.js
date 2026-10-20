// Unit tests for the typed budget errors requestSession throws, and for the reason → error
// mapping that turns the budget module's wire verdict back into one of them.

import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {
    budgetErrorFor,
    InstanceBudgetExceeded,
    StorageBudgetExceeded,
    StorageQuotaExceeded,
} from './budgetErrors.js'

test('InstanceBudgetExceeded is an Error subclass carrying name + username', () => {
    const err = new InstanceBudgetExceeded('bob')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof InstanceBudgetExceeded)
    assert.equal(err.name, 'InstanceBudgetExceeded')
    assert.equal(err.username, 'bob')
})

test('StorageBudgetExceeded is an Error subclass carrying name + username', () => {
    const err = new StorageBudgetExceeded('bob')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof StorageBudgetExceeded)
    assert.equal(err.name, 'StorageBudgetExceeded')
    assert.equal(err.username, 'bob')
})

test('StorageQuotaExceeded is an Error subclass carrying name + username', () => {
    const err = new StorageQuotaExceeded('bob')
    assert.ok(err instanceof Error)
    assert.ok(err instanceof StorageQuotaExceeded)
    assert.equal(err.name, 'StorageQuotaExceeded')
    assert.equal(err.username, 'bob')
})

// The status code is the whole point of the typed errors on the /sessions surface: without it the
// shared httpServer defaults to 500 and an over-budget user looks like a server fault.
for (const Err of [InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded]) {
    test(`${Err} carries statusCode 403 and a user message`, () => {
        const err = new Err('bob')
        assert.equal(err.statusCode, 403)
        assert.match(err.userMessage.key, /^error\.budget\./)
    })
}

describe('budgetErrorFor', () => {
    for (const [reason, Expected] of [
        ['INSTANCE_BUDGET', InstanceBudgetExceeded],
        ['STORAGE_BUDGET', StorageBudgetExceeded],
        ['STORAGE_QUOTA', StorageQuotaExceeded],
    ]) {
        test(`${reason} → ${Expected}`, () => {
            const err = budgetErrorFor(reason, 'bob')
            assert.ok(err instanceof Expected)
            assert.equal(err.username, 'bob')
        })
    }

    test('an unknown or absent reason falls back to InstanceBudgetExceeded — a refusal must never be silently dropped', () => {
        assert.ok(budgetErrorFor('SOMETHING_NEW', 'bob') instanceof InstanceBudgetExceeded)
        assert.ok(budgetErrorFor(null, 'bob') instanceof InstanceBudgetExceeded)
        assert.ok(budgetErrorFor(undefined, 'bob') instanceof InstanceBudgetExceeded)
    })
})
