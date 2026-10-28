import assert from 'node:assert/strict'
import {it} from 'node:test'

import {parseGroups} from '#gee/jobs/ee/batch/parse'

it('parses empty groups', () => {
    assert.deepEqual(parseGroups('groups\n"[]"'), {
        groups: []
    })
})

it('parses groups', () => {
    assert.deepEqual(parseGroups('groups\n"[{stratum=0, sum=5.1}, {stratum=1, sum=4.1}]"'), {
        groups: [
            {stratum: 0, sum: 5.1},
            {stratum: 1, sum: 4.1},
        ]
    })
})
