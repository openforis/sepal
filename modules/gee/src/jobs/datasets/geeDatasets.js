const {get$} = require('#sepal/httpClient')
const {of, map, switchMap, merge} = require('rxjs')
const _ = require('lodash')
const {escapeRegExp, simplifyString, splitString} = require('#sepal/string')
const log = require('#sepal/log').getLogger('ee')

const URL = 'https://earthengine-stac.storage.googleapis.com/catalog/catalog.json'

const datasets = []

const getNode$ = (url = URL) =>
    get$(url).pipe(
        map(({body}) => JSON.parse(body)),
        switchMap(({type, title, id, 'gee:type': geeType, links}) =>
            type === 'Catalog'
                ? merge(...getNodes$(links))
                : of({title, id, type: mapType(geeType), searchTitle: simplifyString(title)})
        )
    )

const getNodes$ = links =>
    links
        .filter(({rel}) => rel === 'child')
        .map(({href}) => getNode$(href))

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
    searchTitle: search => simplifyString(search),
    id: search => search
}
    
const propertyMatcher = (property, search) =>
    RegExp(propertyMatchers[property](search), 'i')
    
log.info('Loading GEE catalog')
    
getNode$().subscribe({
    next: node => datasets.push(node),
    complete: () => log.info(`GEE catalog loaded, ${datasets.length} datasets`)
})

module.exports = {getDatasets}
