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

const datesFor = date => monitoringDates({date})
