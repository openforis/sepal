// const Job = require('#sepal/worker/job')
const {get$} = require('#sepal/httpClient')
const {map} = require('rxjs')
const _ = require('lodash')
const {escapeRegExp, simplifyString, splitString} = require('#sepal/string')
const log = require('#sepal/log').getLogger('ee')

const URL = 'https://raw.githubusercontent.com/samapriya/awesome-gee-community-datasets/master/community_datasets.json'

let datasets = []

const getDatasets$ = () =>
    get$(URL).pipe(
        map(({body}) => JSON.parse(body)),
        map(datasets => mapDataset(datasets))
    )

const mapDataset = datasets =>
    datasets.map(
        ({title, id, type}) => ({
            title: simplifyString(title),
            id,
            type: mapType(type)
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
        .map(({title, id, type}) => ({title, id, type}))

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

log.info('Loading Awesome GEE community datasets')

getDatasets$().subscribe({
    next: content => datasets = content,
    complete: () => log.info(`Awesome GEE community datasets loaded, ${datasets.length} datasets`)
})

module.exports = {getDatasets}
