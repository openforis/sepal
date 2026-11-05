import Papa from 'papaparse'

const COLUMNS = ['band', 'latitude', 'longitude', 'timestamp', 'year', 'series', 'value', 'rmse', 'lower', 'upper', 'model_method', 'is_vertex']

const SERIES_ORDER = {observation: 0, model: 1}

// One CSV of what a pixel chart was prepared from, for its band and pixel: a row for each record a chart family exports -
// {series, timestamp | year, value, rmse, lower, upper, method, vertex} - in time, an observation before the model at
// the same instant, and observations sharing one kept in the order read. A timestamp is the instant itself, in UTC; an
// annual series has a year and none. What a record lacks, or does not have a finite value for, is left blank.
export const pixelChartCsv = ({band, latLng: {lat, lng}, records}) =>
    Papa.unparse({
        fields: COLUMNS,
        data: chronological(records).map(({series, timestamp, year, value, rmse, lower, upper, method, vertex}) => [
            band, lat, lng, timestamp ? timestamp.toISOString() : null, year, series,
            finite(value), finite(rmse), finite(lower), finite(upper), method, typeof vertex === 'boolean' ? String(vertex) : null
        ])
    })

const chronological = records =>
    [...records].sort((a, b) => timeOf(a) - timeOf(b) || SERIES_ORDER[a.series] - SERIES_ORDER[b.series])

const timeOf = ({timestamp, year}) => timestamp ? timestamp.getTime() : year

const finite = value => Number.isFinite(value) ? value : null
