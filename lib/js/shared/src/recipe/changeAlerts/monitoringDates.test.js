import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {monitoringDates, periodDates} from './monitoringDates.js'

describe('the dates a Change Alerts recipe monitors over', () => {
    it('runs the monitoring period back from its end, and the calibration period back from that', () => {
        assert.deepEqual(datesFor({
            monitoringEnd: '2024-06-15',
            monitoringDuration: 2,
            monitoringDurationUnit: 'months',
            calibrationDuration: 3,
            calibrationDurationUnit: 'months'
        }), {
            monitoringEnd: '2024-06-15',
            monitoringStart: '2024-04-15',
            calibrationStart: '2024-01-15'
        })
    })

    it('counts a duration in days', () => {
        assert.equal(datesFor({
            monitoringEnd: '2024-03-01',
            monitoringDuration: 10,
            monitoringDurationUnit: 'days',
            calibrationDuration: 20,
            calibrationDurationUnit: 'days'
        }).calibrationStart, '2024-01-31')
    })

    it('counts a duration in weeks', () => {
        assert.equal(datesFor({
            monitoringEnd: '2024-03-01',
            monitoringDuration: 2,
            monitoringDurationUnit: 'weeks',
            calibrationDuration: 1,
            calibrationDurationUnit: 'weeks'
        }).calibrationStart, '2024-02-09')
    })

    // The day of month a shorter month cannot hold, which is where subtracting a month rolls over into the
    // month after the one meant.
    it('keeps a month subtraction inside the month it lands in', () => {
        assert.deepEqual(datesFor({
            monitoringEnd: '2024-03-31',
            monitoringDuration: 1,
            monitoringDurationUnit: 'months',
            calibrationDuration: 1,
            calibrationDurationUnit: 'months'
        }), {
            monitoringEnd: '2024-03-31',
            monitoringStart: '2024-02-29',
            calibrationStart: '2024-01-29'
        })
    })

    it('counts a duration in years as twelve months', () => {
        assert.deepEqual(datesFor({
            monitoringEnd: '2024-02-29',
            monitoringDuration: 1,
            monitoringDurationUnit: 'months',
            calibrationDuration: 1,
            calibrationDurationUnit: 'years'
        }), {
            monitoringEnd: '2024-02-29',
            monitoringStart: '2024-01-29',
            calibrationStart: '2023-01-29'
        })
    })

    // The digits a form's number input keeps are counted as the number they state.
    it('counts a duration given as digits', () => {
        assert.deepEqual(datesFor({
            monitoringEnd: '2024-06-15',
            monitoringDuration: '2',
            monitoringDurationUnit: 'weeks',
            calibrationDuration: '3',
            calibrationDurationUnit: 'days'
        }), {
            monitoringEnd: '2024-06-15',
            monitoringStart: '2024-06-01',
            calibrationStart: '2024-05-29'
        })
    })

    // A year below 100 is that year, not one in the 1900s, at both boundaries the end is counted back to.
    for (const [
        scenario,
        monitoringEnd,
        monitoringDuration,
        monitoringDurationUnit,
        calibrationDuration,
        calibrationDurationUnit,
        expected
    ] of [
            ['days', '0099-03-01', 1, 'days', 1, 'days', {monitoringStart: '0099-02-28', calibrationStart: '0099-02-27'}],
            ['weeks, across a year', '0001-01-08', 1, 'weeks', 1, 'weeks', {monitoringStart: '0001-01-01', calibrationStart: '0000-12-25'}],
            ['months, to a leap February', '0096-03-31', 1, 'months', 1, 'months', {monitoringStart: '0096-02-29', calibrationStart: '0096-01-29'}],
            ['years', '0050-06-15', 2, 'months', 1, 'years', {monitoringStart: '0050-04-15', calibrationStart: '0049-04-15'}]
        ]) {
        it(`keeps a year below 100, counting in ${scenario}`, () => {
            assert.deepEqual(
                datesFor({monitoringEnd, monitoringDuration, monitoringDurationUnit, calibrationDuration, calibrationDurationUnit}),
                {monitoringEnd, ...expected}
            )
        })
    }

    // YYYY-MM-DD states years 0000 to 9999; a date outside them is refused rather than written truncated.
    for (const [scenario, date] of [
        ['the monitoring start before year 0', {monitoringEnd: '2023-03-01', monitoringDuration: 30000, monitoringDurationUnit: 'months'}],
        ['the calibration start before year 0', {monitoringEnd: '0000-01-02', calibrationDuration: 2, calibrationDurationUnit: 'days'}],
        ['the monitoring start after year 9999', {monitoringEnd: '9999-12-31', monitoringDuration: -1, monitoringDurationUnit: 'days'}]
    ]) {
        it(`refuses ${scenario}`, () => {
            assert.throws(() => datesFor({...COMPLETE, ...date}), /cannot be stated as YYYY-MM-DD/)
        })
    }

    it('refuses a duration unit it cannot count', () => {
        assert.throws(() => datesFor({
            monitoringEnd: '2024-03-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'fortnights',
            calibrationDuration: 1,
            calibrationDurationUnit: 'days'
        }), /fortnights/)
    })

    // Execution must fail loudly on a recipe still being configured, and say what it was given.
    it('says so when the model states no complete period', () => {
        assert.throws(
            () => datesFor({monitoringDuration: 2, monitoringDurationUnit: 'months'}),
            /no complete monitoring period/
        )
    })
})

// What a consumer that must not fail reads: the dates, or which field keeps the period from being computed.
describe('the period a Change Alerts recipe states, read without failing', () => {
    it('is its dates when they can be computed', () => {
        assert.deepEqual(periodDates({date: COMPLETE}), {
            dates: {monitoringEnd: '2024-06-15', monitoringStart: '2024-06-14', calibrationStart: '2024-06-13'}
        })
    })

    for (const [scenario, date, field] of [
        ['a field is missing', {calibrationDuration: undefined}, 'calibrationDuration'],
        ['the end is not text', {monitoringEnd: 20240615}, 'monitoringEnd'],
        ['a unit cannot be counted', {calibrationDurationUnit: 'fortnights'}, 'calibrationDurationUnit'],
        ['a duration is no number', {monitoringDuration: 'two'}, 'monitoringDuration'],
        ['the monitoring start falls before year 0', {monitoringEnd: '0000-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'}, 'monitoringDuration'],
        ['the calibration start falls before year 0', {monitoringEnd: '0000-01-02', calibrationDuration: 2}, 'calibrationDuration']
    ]) {
        it(`names the field that keeps it from being computed when ${scenario}`, () => {
            const {error, ...rest} = periodDates({date: {...COMPLETE, ...date}})
            assert.deepEqual(rest, {})
            assert.equal(error.field, field)
        })
    }

    it('names the first missing field of a recipe stating no period', () => {
        const {error, ...rest} = periodDates({})
        assert.deepEqual(rest, {})
        assert.equal(error.field, 'monitoringEnd')
    })
})

const COMPLETE = {
    monitoringEnd: '2024-06-15',
    monitoringDuration: 1,
    monitoringDurationUnit: 'days',
    calibrationDuration: 1,
    calibrationDurationUnit: 'days'
}

const datesFor = date => monitoringDates({date})
