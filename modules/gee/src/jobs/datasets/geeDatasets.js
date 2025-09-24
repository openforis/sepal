const {get$} = require('#sepal/httpClient')
const {of, map, switchMap, mergeMap, toArray, timer, tap, catchError, EMPTY} = require('rxjs')
const _ = require('lodash')
const {escapeRegExp, simplifyString, splitString} = require('#sepal/string')
const log = require('#sepal/log').getLogger('ee')

const URL = 'https://earthengine-stac.storage.googleapis.com/catalog/catalog.json'
const REFRESH_INTERVAL_HOURS = 24
const CONCURRENCY = 10

let datasets = []

const getNode$ = (url = URL) =>
    get$(url).pipe(
        catchError(error => {
            log.error('Error while downloading GEE catalog - ', error)
            return EMPTY
        }),
        map(({body}) => JSON.parse(body)),
        switchMap(({type, title, id, 'gee:type': geeType, links, providers}) =>
            type === 'Catalog'
                ? getChildNodes$(links).pipe(
                    mergeMap(url => getNode$(url), CONCURRENCY)
                )
                : of({
                    title,
                    id,
                    type: mapType(geeType),
                    searchTitle: simplifyString(title),
                    url: getUrl(providers)
                })
        )
    )

const getChildNodes$ = links =>
    of(...getChildNodes(links))

const getChildNodes = links =>
    links
        .filter(({rel}) => rel === 'child')
        .map(({href}) => href)

const TYPE_MAP = {
    'image': 'Image',
    'image_collection': 'ImageCollection',
    'table': 'Table'
}
    
const mapType = type =>
    TYPE_MAP[type]

const getUrl = providers =>
    providers.find(({roles}) => roles.includes('host'))?.url

const sortByDeprecationAndTitle = (a, b) => {
    const aTitle = a.title
    const aDeprecated = a.title.includes('[deprecated]')
    const bTitle = b.title
    const bDeprecated = b.title.includes('[deprecated]')
    return aTitle === bTitle
        ? 0
        : aDeprecated === bDeprecated
            ? aTitle > bTitle
                ? 1
                : -1
            : aDeprecated > bDeprecated
                ? 1
                : -1
}
const getDatasets = (text, allowedTypes) =>
    datasets
        .filter(({type}) => isMatchingAllowedTypes(type, allowedTypes))
        .filter(dataset => isMatchingText(dataset, getSearchElements(text)))
        .map(({title, id, type, url}) => ({title, id, type, url}))
        .toSorted(sortByDeprecationAndTitle)

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

timer(0, REFRESH_INTERVAL_HOURS * 3600000).pipe(
    tap(() => log.info('Loading GEE catalog')),
    switchMap(() =>
        getNode$().pipe(
            toArray()
        )
    )
).subscribe({
    next: content => {
        datasets = content
        log.info(`GEE catalog loaded, ${datasets.length} datasets`)
    }
})

module.exports = {getDatasets}
