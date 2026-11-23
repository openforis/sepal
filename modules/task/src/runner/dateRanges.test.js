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

test('month-end ranges keep both boundaries anchored to the original start date', () => {
    assert.deepEqual(
        chunkDateRanges({startDate: '2020-01-31', endDate: '2020-12-31'}),
        [
            {startDate: '2020-01-31', endDate: '2020-04-30'},
            {startDate: '2020-04-30', endDate: '2020-07-31'},
            {startDate: '2020-07-31', endDate: '2020-10-31'},
            {startDate: '2020-10-31', endDate: '2020-12-31'}
        ]
    )
})

for (const dates of [
    {startDate: '2020-01-31', endDate: '2020-07-31'},
    {startDate: '2019-11-30', endDate: '2020-08-31'},
    {startDate: '2020-11-30', endDate: '2021-08-31'}
]) {
    test(`ranges cover ${dates.startDate} to ${dates.endDate} without gaps or overlaps`, () => {
        const ranges = chunkDateRanges(dates)

        assert.equal(ranges[0].startDate, dates.startDate)
        assert.equal(ranges.at(-1).endDate, dates.endDate)
        ranges.slice(1).forEach(({startDate}, index) => assert.equal(ranges[index].endDate, startDate))
    })
}
