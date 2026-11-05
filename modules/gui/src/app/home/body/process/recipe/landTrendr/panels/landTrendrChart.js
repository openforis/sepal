import _ from 'lodash'

// A pixel's LandTrendr chart as it is drawn and exported, from what was read for one band (the recipe's index) at one
// pixel: each year's annual composite (`raw`), the value fitted to it, and whether LandTrendr made the year a vertex.
export const landTrendrChart = ({band, latLng, segments}) => {
    const [years = [], raw = [], fitted = [], isVertex = []] = segments.LandTrendr || []
    return {band, latLng, years, raw, fitted, isVertex, empty: !years.length}
}

// LandTrendr fits a value for every year of the series - the vertices are only where the trajectory changes slope, so
// plotting vertices alone drew the same line but left the hovered year with nothing to report. Dygraph is given its
// error bars as zeros: they are placeholders, not uncertainty.
export const landTrendrChartRows = ({years, raw, fitted}) =>
    years.map((year, i) => [
        new Date(year, 6, 1),
        _.isFinite(raw[i]) ? [raw[i], 0] : null,
        _.isFinite(fitted[i]) ? [fitted[i], 0] : null
    ])

// Annual values carry their year and no date, and LandTrendr returns no uncertainty for them.
export const landTrendrExportRecords = ({years, raw, fitted, isVertex}) => [
    ...years.map((year, i) => ({series: 'observation', year, value: finiteOrNull(raw[i])})),
    ...years.map((year, i) => ({
        series: 'model',
        year,
        value: finiteOrNull(fitted[i]),
        method: _.isFinite(fitted[i]) ? 'fitted' : 'masked',
        vertex: _.isNil(isVertex[i]) ? null : Boolean(isVertex[i])
    }))
]

const finiteOrNull = value => _.isFinite(value) ? value : null
