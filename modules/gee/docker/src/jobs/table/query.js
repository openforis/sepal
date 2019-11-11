const log = require('@sepal/log')
const job = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')

const worker$ = ({select, from, where = [], orderBy = []}) => {
    const ee = require('@google/earthengine')
    const {getInfo$} = require('@sepal/ee/utils')
    const {map} = require('rxjs/operators')
    const _ = require('lodash')

    log.debug('Query EE table:', {select, from, where, orderBy})

    const collection = ee.FeatureCollection(from)
    const filtered = where.reduce((c, f) => c.filterMetadata(f[0], f[1], f[2]), collection)
    const sorted = orderBy.reduce((c, sort) => c.sort(sort), filtered)
    return getInfo$(sorted
        .reduceColumns(ee.Reducer.toList(select.length), select)
        .get('list')
    ).pipe(
        map(
            rows => rows.map(row => {
                    const l = row.map((value, i) =>
                        ({[select[i]]: value})
                    )
                    return _.assign({}, ...l)
                }
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

