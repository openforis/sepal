import assert from 'node:assert/strict'
import {test} from 'node:test'

import {chunkDateRanges} from './dateRanges.js'

test('splits the recipe dates into three-month ranges, the last ending at the end date', () => {
    assert.deepEqual(chunkDateRanges({startDate: '2020-01-01', endDate: '2020-08-15'}), [
        {startDate: '2020-01-01', endDate: '2020-04-01'},
        {startDate: '2020-04-01', endDate: '2020-07-01'},
        {startDate: '2020-07-01', endDate: '2020-08-15'}
    ])
})

test('a period shorter than three months is one range', () => {
    assert.deepEqual(chunkDateRanges({startDate: '2020-01-01', endDate: '2020-02-01'}), [
        {startDate: '2020-01-01', endDate: '2020-02-01'}
    ])
})

test('an end date exactly three months after the start date is one range', () => {
    assert.deepEqual(chunkDateRanges({startDate: '2020-01-01', endDate: '2020-04-01'}), [
        {startDate: '2020-01-01', endDate: '2020-04-01'}
    ])
})

test('range starts are offsets from the start date, so month ends do not drift', () => {
    assert.deepEqual(
        chunkDateRanges({startDate: '2020-01-31', endDate: '2020-12-31'}).map(({startDate}) => startDate),
        [
            '2020-01-31', '2020-04-30', '2020-07-31', '2020-10-31'
        ]
    )
})
