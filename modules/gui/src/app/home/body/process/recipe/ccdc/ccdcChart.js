import _ from 'lodash'
import moment from 'moment'

import {sequence} from '~/array'

import {fromT, toT} from './t'

// How many times its uncertainty a model value's band is drawn either side of it (Dygraph's `sigma`).
export const UNCERTAINTY_SIGMA = 1

// A pixel's CCDC-family chart as it is drawn and exported, prepared once from what was read for one band at one pixel:
// the observations as read and, given segments, the model for each day of the period - local midnights, the instants it
// is evaluated at. Within a segment the model is fitted; around and between segments the gap strategy interpolates,
// extrapolates or masks it, using no segment that is not there. A model day carries its `uncertainty`, drawn either side
// of its value; `segmentIndex`, the segment it is fitted to or extrapolated from, or for an interpolated day the one its
// gap follows; and `rmse`, that of the one segment it is evaluated from, which an interpolated day has none of.
export const ccdcChart = ({
    band, latLng, startDate, endDate, dateFormat = 0, harmonics = 3, segments, observations,
    gapStrategy = 'MASK', extrapolateSegment = 'CLOSEST', extrapolateMaxDays = 30
}) => {
    const period = {
        startDate: startDate || (segments ? fromT(segments.tStart[0], dateFormat) : null),
        endDate: endDate || (segments ? fromT(segments.tEnd[segments.tEnd.length - 1], dateFormat) : null)
    }
    const model = segments
        ? modelOf({...period, band, dateFormat, harmonics, segments, gapStrategy, extrapolateSegment, extrapolateMaxDays})
        : null
    return {
        band, latLng, dateFormat, segments, observations, model, ...period,
        empty: !observations?.features.length && !model?.length
    }
}

// What Dygraph is given. With a model, a row a day, with the observation read that day - the last of them, should there
// be several. Without one, a row an observation.
export const ccdcChartRows = ({model, observations}) => {
    if (!model) {
        return observations.features.map(({properties: {date, value}}) => [new Date(date.value), [value, 0], null])
    }
    const observationByDay = {}
    observations?.features.forEach(({properties: {date, value}}) =>
        observationByDay[moment(date.value).startOf('day').valueOf()] = [value, 0]
    )
    return model.map(({date, value, uncertainty, method}) => [
        date,
        observationByDay[date.getTime()] || null,
        method === 'masked' ? NaN : [value, uncertainty]
    ])
}

// Every observation as read, at its own instant, and every model day. A day's bounds are the band drawn around its value.
export const ccdcExportRecords = ({observations, model}) => [
    ...(observations?.features || []).map(({properties: {date, value}}) =>
        ({series: 'observation', timestamp: new Date(date.value), value: finiteOrNull(value)})
    ),
    ...(model || []).map(({date, value, uncertainty, rmse, method}) => {
        const bounded = _.isFinite(value) && _.isFinite(uncertainty)
        return {
            series: 'model',
            timestamp: date,
            value: finiteOrNull(value),
            rmse: finiteOrNull(rmse),
            lower: bounded ? value - UNCERTAINTY_SIGMA * uncertainty : null,
            upper: bounded ? value + UNCERTAINTY_SIGMA * uncertainty : null,
            method
        }
    })
]

const modelOf = ({
    startDate, endDate, band, dateFormat, harmonics, segments, gapStrategy, extrapolateSegment, extrapolateMaxDays
}) => {
    if (!segments.tStart.length) {
        return []
    }
    const bandCoefs = segments[`${band}_coefs`]
    const bandRmse = segments[`${band}_rmse`]
    const daysBetween = (from, to) => moment(fromT(to, dateFormat)).diff(moment(fromT(from, dateFormat)), 'days')

    const fitted = ({date, segmentIndex}) => {
        const rmse = bandRmse[segmentIndex]
        return {date, value: slice({coefs: bandCoefs[segmentIndex], date, dateFormat, harmonics}), uncertainty: rmse, rmse, segmentIndex, method: 'fitted'}
    }

    const masked = ({date}) => ({date, value: null, uncertainty: null, rmse: null, method: 'masked'})

    const gap = ({date, prevSegmentIndex, nextSegmentIndex}) => {
        if (gapStrategy === 'INTERPOLATE' && prevSegmentIndex >= 0 && nextSegmentIndex >= 0) {
            return interpolate({date, prevSegmentIndex, nextSegmentIndex})
        } else if (gapStrategy === 'EXTRAPOLATE') {
            return extrapolate({date, prevSegmentIndex, nextSegmentIndex})
        } else {
            return masked({date})
        }
    }

    const extrapolate = ({date, prevSegmentIndex, nextSegmentIndex}) => {
        const {segmentIndex, days} = extrapolatedFrom({date, prevSegmentIndex, nextSegmentIndex})
        if (segmentIndex < 0 || days > extrapolateMaxDays) {
            return masked({date})
        }
        const rmse = bandRmse[segmentIndex]
        return {date, value: slice({coefs: bandCoefs[segmentIndex], date, dateFormat, harmonics}), uncertainty: rmse, rmse, segmentIndex, method: 'extrapolated'}
    }

    // The segment a gap's date is extrapolated from, and how many days from it the date is: the closest, previous or
    // next one, which before the first segment and after the last can only be the one there is.
    const extrapolatedFrom = ({date, prevSegmentIndex, nextSegmentIndex}) => {
        const t = toT(date, dateFormat)
        if (prevSegmentIndex < 0) {
            return extrapolateSegment === 'PREVIOUS'
                ? {segmentIndex: -1}
                : {segmentIndex: nextSegmentIndex, days: daysBetween(t, segments.tStart[nextSegmentIndex])}
        }
        if (nextSegmentIndex < 0) {
            return extrapolateSegment === 'NEXT'
                ? {segmentIndex: -1}
                : {segmentIndex: prevSegmentIndex, days: daysBetween(segments.tEnd[prevSegmentIndex], t)}
        }
        const days = daysBetween(segments.tEnd[prevSegmentIndex], segments.tStart[nextSegmentIndex])
        const day = daysBetween(segments.tEnd[prevSegmentIndex], t)
        const segmentIndex = extrapolateSegment === 'PREVIOUS'
            ? prevSegmentIndex
            : extrapolateSegment === 'NEXT'
                ? nextSegmentIndex
                : day < days / 2
                    ? prevSegmentIndex
                    : nextSegmentIndex
        return {segmentIndex, days: segmentIndex === prevSegmentIndex ? day : days - day}
    }

    const interpolate = ({date, prevSegmentIndex, nextSegmentIndex}) => {
        const t = toT(date, dateFormat)
        const days = daysBetween(segments.tEnd[prevSegmentIndex], segments.tStart[nextSegmentIndex])
        const day = daysBetween(segments.tEnd[prevSegmentIndex], t)
        const endWeight = (day + 1) / (days + 1)
        const startWeight = 1 - endWeight
        const startCoefs = bandCoefs[prevSegmentIndex]
        const endCoefs = bandCoefs[nextSegmentIndex]
        const coefs = sequence(0, 7).map(coefIndex =>
            startCoefs[coefIndex] * startWeight + endCoefs[coefIndex] * endWeight
        )
        const uncertainty = Math.sqrt(
            Math.pow(bandRmse[prevSegmentIndex] * startWeight, 2)
            + Math.pow(bandRmse[nextSegmentIndex] * endWeight, 2)
        )
        return {date, value: slice({coefs, date, dateFormat, harmonics}), uncertainty, rmse: null, segmentIndex: prevSegmentIndex, method: 'interpolated'}
    }

    const segmentStart = moment(fromT(segments.tStart[0], dateFormat))
    const beforePoints = sequence(0, segmentStart.diff(moment(startDate), 'days') - 1)
        .map(dateOffset => {
            const date = moment(startDate).add(dateOffset, 'days').toDate()
            return gap({date, prevSegmentIndex: -1, nextSegmentIndex: 0})
        })
    const numberOfSegments = segments.tStart.length
    const segmentsPoints = segments.tStart.map((tStart, segmentIndex) => {
        const segmentStart = moment(fromT(tStart, dateFormat)).startOf('day')
        const segmentEnd = moment(fromT(segments.tEnd[segmentIndex], dateFormat)).startOf('day')
        const modelPoints = sequence(0, segmentEnd.diff(segmentStart, 'days') - 1)
            .map(dateOffset => {
                const date = moment(segmentStart).add(dateOffset, 'days').toDate()
                return fitted({date, segmentIndex})
            })
        const gapEnd = moment(segmentIndex < numberOfSegments - 1
            ? fromT(segments.tStart[segmentIndex + 1], dateFormat)
            : endDate)
        const gapPoints = sequence(0, gapEnd.diff(segmentEnd, 'days') - 1)
            .map(dateOffset => {
                const date = moment(segmentEnd).add(dateOffset, 'days').toDate()
                return gap({
                    date,
                    prevSegmentIndex: segmentIndex,
                    nextSegmentIndex: segmentIndex < numberOfSegments - 1
                        ? segmentIndex + 1
                        : -1
                })
            })
        return [...modelPoints, ...gapPoints]
    }).flat()
    return [...beforePoints, ...segmentsPoints]
}

const slice = ({coefs, date, dateFormat, harmonics}) => {
    const t = toT(date, dateFormat)
    const omega = getOmega(dateFormat)

    return [
        coefs[0] + (coefs[1] * t),
        coefs[2] * Math.cos(t * omega) + coefs[3] * Math.sin(t * omega),
        coefs[4] * Math.cos(t * omega * 2) + coefs[5] * Math.sin(t * omega * 2),
        coefs[6] * Math.cos(t * omega * 3) + coefs[7] * Math.sin(t * omega * 3)
    ].slice(0, harmonics + 1).reduce((acc, value) => acc + value, 0)
}

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

const getOmega = dateFormat => {
    switch (dateFormat) {
        case J_DAYS:
            return 2.0 * Math.PI / 365.25
        case FRACTIONAL_YEARS:
            return 2.0 * Math.PI
        case UNIX_TIME_MILLIS:
            return 2.0 * Math.PI / (1000 * 60 * 60 * 24 * 365.25)
        default:
            throw Error('Only dateFormat 0 (Julian days), 1 (Fractional years), and 2 (Unix time milliseconds) is supported')
    }
}

const finiteOrNull = value => _.isFinite(value) ? value : null
