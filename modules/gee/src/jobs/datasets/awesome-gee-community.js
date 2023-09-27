const Job = require('#sepal/worker/job')

const URL = 'https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.json'
const MAX_RESULTS = 10

let cached = null

const worker$ = ({search, allowedTypes}) => {
    const {get$} = require('#sepal/httpClient')
    const {of, map, tap} = require('rxjs')
    const _ = require('lodash')
    const {escapeRegExp, simplifyString, splitString} = require('#sepal/string')

    const searchElements = splitString(escapeRegExp(search))

    const getDataset$ = () =>
        cached
            ? of(cached)
            : get$(URL).pipe(
                map(({body}) => JSON.parse(body)),
                map(datasets => mapOriginalDatasets(datasets)),
                tap(content => cached = content)
            )

    const mapOriginalDatasets = datasets =>
        datasets.map(
            ({title, id, provider, type, tags}) => ({title: simplifyString(title), id, provider, type: mapType(type), tags})
        )

    const TYPE_MAP = {
        'image': 'Image',
        'image_collection': 'ImageCollection',
        'table': 'Table'
    }

    const mapType = type =>
        TYPE_MAP[type]

    const propertyMatchers = {
        title: search => simplifyString(search),
        id: search => search,
        provider: search => simplifyString(search),
        tags: search => search
    }

    const propertyMatcher = (property, search) =>
        RegExp(propertyMatchers[property](search), 'i')

    const isMatchingAllowedTypes = dataset =>
        !allowedTypes || allowedTypes.includes(dataset.type)

    const isMatchingText = dataset =>
        searchElements.length
            ? _.every(searchElements, searchElement =>
                _.find(Object.keys(propertyMatchers), property =>
                    propertyMatcher(property, searchElement).test(dataset[property])
                )
            )
            : false

    const mapDatasets = datasets =>
        datasets
            .filter(dataset => isMatchingAllowedTypes(dataset))
            .filter(dataset => isMatchingText(dataset))
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
