// const log = require('@sepal/log')
const job = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')

const worker$ = ({select, from, where = [], orderBy = []}) => {
    const ee = require('@google/earthengine')
    const {getInfo$} = require('@sepal/ee/utils')
    const {map} = require('rxjs/operators')
    const _ = require('lodash')

    const collection = ee.FeatureCollection(from)
    const filtered = where.reduce((c, f) => c.filterMetadata(f[0], f[1], f[2]), collection)
    const sorted = orderBy.reduce((c, sort) => c.sort(sort), filtered)

    return getInfo$(sorted
        .reduceColumns(ee.Reducer.toList(select.length), select)
        .get('list')
    ).pipe(
        map(rows =>
            rows.map(row =>
                row.reduce(
                    (acc, value, i) => ({...acc, [select[i]]: value}),
                    {}
                )
            )
        )
    )
}

module.exports = job({
    jobName: 'Query EE Table',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
