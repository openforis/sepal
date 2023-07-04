const {job} = require('#gee/jobs/job')

const worker$ = ({select, from, where = [], distinct = [], orderBy = []}) => {
    const ee = require('#sepal/ee')
    const {map} = require('rxjs')

    const collection = ee.FeatureCollection(from)
    const filtered = where.reduce((c, f) => c.filterMetadata(f[0], f[1], f[2]), collection)
    const withDistinct = distinct.length ? filtered.distinct(distinct) : filtered
    const sorted = orderBy.reduce((c, sort) => c.sort(sort), withDistinct)

    return ee.getInfo$(
        sorted
            .reduceColumns(ee.Reducer.toList(select.length), select)
            .get('list'),
        'query EE table'
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
    worker$
})
