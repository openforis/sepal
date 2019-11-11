const log = require('../log')
const job = require('../job')
const eeAuth = require('./eeAuth')
const {getInfo$} = require('./eeUtils')

const worker$ = ({select, from, where = [], orderBy = []}) => {
    const ee = require('@google/earthengine')
    const {map} = require('rxjs/operators')
    const _ = require('lodash')

    log.info(`Query EE table: select ${select} from ${from} where ${where} orderBy ${orderBy}`)

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
    jobName: 'Query table',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})

