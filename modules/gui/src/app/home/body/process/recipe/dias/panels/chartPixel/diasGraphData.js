// The sensors in the order lib/js/ee/src/dias/diCollection.js numbers them (SOURCE_ID), each charted as its own series.
export const SENSORS = [1, 2, 3, 4]

export const toDate = ydoy =>
    new Date(Math.floor(ydoy / 1000), 0, ydoy % 1000)

// One row per observation, oldest first, holding its DI in the column of the sensor that observed it, and the
// threshold in the last column so it draws as a line across the whole period.
export const diasGraphData = ({observations, threshold}) =>
    [...observations]
        .sort((a, b) => a.ydoy - b.ydoy || a.source - b.source)
        .map(({di, source, ydoy}) => [
            toDate(ydoy),
            ...SENSORS.map(sensor => sensor === source ? di : null),
            threshold
        ])

// The period from the first to the confirming observation of the pixel's alert, if it has one.
export const alertPeriod = alert =>
    alert?.first_ydoy && alert?.confirming_ydoy
        ? {startDate: toDate(alert.first_ydoy), endDate: toDate(alert.confirming_ydoy)}
        : null
