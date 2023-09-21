const Job = require('#sepal/worker/job')

const URL = 'https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.json'
const MAX_RESULTS = 10

let cached = null

const worker$ = ({search}) => {
    const {get$} = require('#sepal/httpClient')
    const {of, map, tap} = require('rxjs')
    const _ = require('lodash')
    const {escapeRegExp, simplifyString, splitString} = require('#sepal/string')

    const getDataset$ = () =>
        cached
            ? of(cached)
            : get$(URL).pipe(
                map(({body}) => JSON.parse(body)),
                map(datasets => mapOriginalDatasets(datasets)),
                tap(content => cached = content)
            )

    const mapOriginalDatasets = datasets =>
        datasets.map(({title, id, provider, type, tags}) => ({title, id, provider, type: mapType(type), tags}))

    const TYPE_MAP = {
        'image': 'Image',
        'image_collection': 'ImageCollection',
        'table': 'Table'
    }

    const mapType = type =>
        TYPE_MAP[type]

    const isDatasetMatching = ({title, id, provider, tags}) => {
        const searchElements = splitString(simplifyString(escapeRegExp(search)))
        if (searchElements.length) {
            const searchMatchers = searchElements.map(filter => RegExp(filter, 'i'))
            const searchProperties = [title, id, provider, tags].map(simplifyString)
            return _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(property)
                )
            )
        }
        return false
    }

    const mapDatasets = datasets =>
        datasets
            .filter(dataset => isDatasetMatching(dataset))
            .slice(0, MAX_RESULTS)

    return getDataset$().pipe(
        map(datasets => mapDatasets(datasets))
    )
}

module.exports = Job()({
    jobName: 'Awesome GEE Community Datasets',
    jobPath: __filename,
    schedulerName: 'default',
    args: ctx => [ctx.request.query],
    worker$
})
