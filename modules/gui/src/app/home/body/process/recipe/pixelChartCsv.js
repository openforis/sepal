import Papa from 'papaparse'

const COLUMNS = ['band', 'latitude', 'longitude', 'timestamp', 'year', 'series', 'value', 'rmse', 'lower', 'upper', 'model_method', 'is_vertex']

const SERIES_ORDER = {observation: 0, model: 1}

// One CSV of what a pixel chart was prepared from, for its band and pixel: a row for each record a chart family exports -
// {series, timestamp | year, value, rmse, lower, upper, method, vertex} - in time, an observation before the model at
// the same instant, and observations sharing one kept in the order read. A timestamp is the instant itself, in UTC; an
// annual series has a year and none. Absent fields are omitted; fields supplied with missing values stay as blank
// columns. A series column is needed only when observations and model records share the file.
export const pixelChartCsv = ({band, latLng: {lat, lng}, records}) => {
    const rows = chronological(records).map(({series, timestamp, year, value, rmse, lower, upper, method, vertex}) => ({
        band,
        latitude: lat,
        longitude: lng,
        timestamp: timestamp?.toISOString(),
        year,
        series,
        value: finite(value),
        rmse: finite(rmse),
        lower: finite(lower),
        upper: finite(upper),
        model_method: method,
        is_vertex: vertex
    }))
    const mixed = new Set(records.map(({series}) => series)).size > 1
    const fields = COLUMNS.filter(column => column === 'series' ? mixed : rows.some(row => row[column] !== undefined))
    return Papa.unparse({fields, data: rows})
}

const chronological = records =>
    [...records].sort((a, b) => timeOf(a) - timeOf(b) || SERIES_ORDER[a.series] - SERIES_ORDER[b.series])

const timeOf = ({timestamp, year}) => timestamp ? timestamp.getTime() : year

const finite = value => value === undefined ? undefined : Number.isFinite(value) ? value : null
