import {describe, expect, it} from 'vitest'

import {budgetOf} from './budgetOf'

describe('budgetOf', () => {
    it('takes the username and every limit, Data quota included, from the edited user', () => {
        const userDetails = {username: 'bob', name: 'Bob', instanceSpending: 1, storageSpending: 2, storageQuota: 3, dataQuota: 4}

        expect(budgetOf(userDetails)).toEqual({username: 'bob', instanceSpending: 1, storageSpending: 2, storageQuota: 3, dataQuota: 4})
    })
})
