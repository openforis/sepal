import {monitoringDates} from './monitoringDates.js'

describe('the dates a Change Alerts recipe monitors over', () => {
    it('runs the monitoring period back from its end, and the calibration period back from that', () => {
        expect(datesFor({
            monitoringEnd: '2024-06-15',
            monitoringDuration: 2,
            monitoringDurationUnit: 'months',
            calibrationDuration: 3,
            calibrationDurationUnit: 'months'
        })).toEqual({
            monitoringEnd: '2024-06-15',
            monitoringStart: '2024-04-15',
            calibrationStart: '2024-01-15'
        })
    })

    it('counts a duration in days', () => {
        expect(datesFor({
            monitoringEnd: '2024-03-01',
            monitoringDuration: 10,
            monitoringDurationUnit: 'days',
            calibrationDuration: 20,
            calibrationDurationUnit: 'days'
        }).calibrationStart).toBe('2024-01-31')
    })

    it('counts a duration in weeks', () => {
        expect(datesFor({
            monitoringEnd: '2024-03-01',
            monitoringDuration: 2,
            monitoringDurationUnit: 'weeks',
            calibrationDuration: 1,
            calibrationDurationUnit: 'weeks'
        }).calibrationStart).toBe('2024-02-09')
    })

    // The day of month a shorter month cannot hold, which is where subtracting a month rolls over into the
    // month after the one meant.
    it('keeps a month subtraction inside the month it lands in', () => {
        expect(datesFor({
            monitoringEnd: '2024-03-31',
            monitoringDuration: 1,
            monitoringDurationUnit: 'months',
            calibrationDuration: 1,
            calibrationDurationUnit: 'months'
        })).toEqual({
            monitoringEnd: '2024-03-31',
            monitoringStart: '2024-02-29',
            calibrationStart: '2024-01-29'
        })
    })

    it('counts a duration in years as twelve months', () => {
        expect(datesFor({
            monitoringEnd: '2024-02-29',
            monitoringDuration: 1,
            monitoringDurationUnit: 'months',
            calibrationDuration: 1,
            calibrationDurationUnit: 'years'
        })).toEqual({
            monitoringEnd: '2024-02-29',
            monitoringStart: '2024-01-29',
            calibrationStart: '2023-01-29'
        })
    })

    // The digits a form's number input keeps are counted as the number they state.
    it('counts a duration given as digits', () => {
        expect(datesFor({
            monitoringEnd: '2024-06-15',
            monitoringDuration: '2',
            monitoringDurationUnit: 'weeks',
            calibrationDuration: '3',
            calibrationDurationUnit: 'days'
        })).toEqual({
            monitoringEnd: '2024-06-15',
            monitoringStart: '2024-06-01',
            calibrationStart: '2024-05-29'
        })
    })

    // A year below 100 is that year, not one in the 1900s, at both boundaries the end is counted back to.
    it.each([
        ['days', '0099-03-01', 1, 'days', 1, 'days', {monitoringStart: '0099-02-28', calibrationStart: '0099-02-27'}],
        ['weeks, across a year', '0001-01-08', 1, 'weeks', 1, 'weeks', {monitoringStart: '0001-01-01', calibrationStart: '0000-12-25'}],
        ['months, to a leap February', '0096-03-31', 1, 'months', 1, 'months', {monitoringStart: '0096-02-29', calibrationStart: '0096-01-29'}],
        ['years', '0050-06-15', 2, 'months', 1, 'years', {monitoringStart: '0050-04-15', calibrationStart: '0049-04-15'}]
    ])('keeps a year below 100, counting in %s', (_case, monitoringEnd, monitoringDuration, monitoringDurationUnit, calibrationDuration, calibrationDurationUnit, expected) => {
        expect(datesFor({monitoringEnd, monitoringDuration, monitoringDurationUnit, calibrationDuration, calibrationDurationUnit}))
            .toEqual({monitoringEnd, ...expected})
    })

    // YYYY-MM-DD states years 0000 to 9999; a date outside them is refused rather than written truncated.
    it.each([
        ['the monitoring start before year 0', {monitoringEnd: '2023-03-01', monitoringDuration: 30000, monitoringDurationUnit: 'months'}],
        ['the calibration start before year 0', {monitoringEnd: '0000-01-02', calibrationDuration: 2, calibrationDurationUnit: 'days'}],
        ['the monitoring start after year 9999', {monitoringEnd: '9999-12-31', monitoringDuration: -1, monitoringDurationUnit: 'days'}]
    ])('refuses %s', (_case, date) => {
        expect(() => datesFor({...COMPLETE, ...date})).toThrow(/cannot be stated as YYYY-MM-DD/)
    })

    it('refuses a duration unit it cannot count', () => {
        expect(() => datesFor({
            monitoringEnd: '2024-03-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'fortnights',
            calibrationDuration: 1,
            calibrationDurationUnit: 'days'
        })).toThrow(/fortnights/)
    })

    // Execution must fail loudly on a recipe still being configured, and say what it was given.
    it('says so when the model states no complete period', () => {
        expect(() => datesFor({monitoringDuration: 2, monitoringDurationUnit: 'months'}))
            .toThrow(/no complete monitoring period/)
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
