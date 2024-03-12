// const Job = require('#sepal/worker/job')
const {get$} = require('#sepal/httpClient')
const {map, timer, tap, switchMap} = require('rxjs')
const _ = require('lodash')
const {escapeRegExp, simplifyString, splitString} = require('#sepal/string')
const log = require('#sepal/log').getLogger('ee')

const URL = 'https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.json'
const REFRESH_INTERVAL_HOURS = 24

let datasets = []

const EXCLUDED_LICENSES = [
    'Creative Commons Attribution Non Commercial 4.0 International',
    'Creative Commons Attribution Non Commercial No Derivatives 4.0 International',
    'Creative Commons Attribution Non Commercial Share Alike 4.0 International'
]

const getDatasets$ = () =>
    get$(URL).pipe(
        map(({body}) => JSON.parse(body)),
        map(datasets => mapDataset(datasets))
    )

const mapDataset = datasets =>
    datasets
        .filter(
            ({license}) => !EXCLUDED_LICENSES.includes(license)
        )
        .map(
            ({title, id, type, docs}) => ({
                title: simplifyString(title),
                id,
                type: mapType(type),
                url: docs
            })
        )

const TYPE_MAP = {
    'image': 'Image',
    'image_collection': 'ImageCollection',
    'table': 'Table'
}

const mapType = type =>
    TYPE_MAP[type]

const getDatasets = (text, allowedTypes) =>
    datasets
        .filter(({type}) => isMatchingAllowedTypes(type, allowedTypes))
        .filter(dataset => isMatchingText(dataset, getSearchElements(text)))
        .map(({title, id, type, url}) => ({title, id, type, url}))

const getSearchElements = text =>
    splitString(escapeRegExp(text))
    
const isMatchingAllowedTypes = (type, allowedTypes) =>
    !allowedTypes || allowedTypes.includes(type)

const isMatchingText = (dataset, searchElements) =>
    searchElements.length
        ? _.every(searchElements, searchElement =>
            _.find(Object.keys(propertyMatchers), property =>
                propertyMatcher(property, searchElement).test(dataset[property])
            )
        )
        : false

const propertyMatchers = {
    title: search => simplifyString(search),
    id: search => search
}
        
const propertyMatcher = (property, search) =>
    RegExp(propertyMatchers[property](search), 'i')

timer(0, REFRESH_INTERVAL_HOURS * 3600000).pipe(
    tap(() => log.info('Loading Awesome GEE community datasets')),
    switchMap(() => getDatasets$())
).subscribe({
    next: content => {
        datasets = content
        log.info(`Awesome GEE community datasets loaded, ${datasets.length} datasets`)
    }
})

module.exports = {getDatasets}
