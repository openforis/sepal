const {map, tap, EMPTY} = require('rxjs')
const {postJson$} = require('#sepal/httpClient')
const log = require('#sepal/log').getLogger('earthSearch')

const SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search'

const COLLECTION = {
    'landsat-ot': 'landsat-c2-l2',
    'sentinel-2': 'sentinel-2-l1c'
}

const BLOCK_SIZE = {
    'landsat-c2-l2': 200,
    'sentinel-2-l1c': 500,
}

const getScenes = (features, sceneMapper) =>
    features.map(feature => sceneMapper(feature)).filter(Boolean)

const getToken = links =>
    links.find(({rel}) => rel === 'next')?.body?.next

const getResponse = ({features, links}, sceneMapper) => {
    const scenes = getScenes(features, sceneMapper)
    const token = scenes.length ? getToken(links) : null
    const mostRecentTimestamp = scenes.reduce(
        (mostRecentTimestamp, {acquiredTimestamp}) =>
            !mostRecentTimestamp || acquiredTimestamp > mostRecentTimestamp
                ? acquiredTimestamp
                : mostRecentTimestamp,
        null
    )
    return {scenes, token, mostRecentTimestamp}
}

const getCollection = source => {
    const collection = COLLECTION[source]
    if (!collection) {
        throw new Error(`Unknown collection for source: ${source}`)
    }
    return collection
}

const getUpdates$ = ({source, sceneMapper, minTimestamp, maxTimestamp, token}) => {
    const collection = getCollection(source)
    if (maxTimestamp >= minTimestamp) {
        log.info(token ? `Retrieving ${collection} scenes, token: ${token}` : `Getting ${collection} scenes between ${minTimestamp} and ${maxTimestamp}`)
        return postJson$(SEARCH_URL, {
            body: {
                collections: [collection],
                datetime: `${minTimestamp}/${maxTimestamp}`,
                limit: BLOCK_SIZE[collection],
                next: token
            },
            retry: {
                maxRetries: 0
            }
        }).pipe(
            map(({body}) => JSON.parse(body)),
            map(response => getResponse(response, sceneMapper)),
            tap(({scenes}) => log.info(scenes.length ? `Retrieved ${collection} scenes: ${scenes.length}` : `No more ${collection} scenes`))
        )
    } else {
        log.info(`No scenes to retrieve between ${minTimestamp} and ${maxTimestamp}`)
        return EMPTY
    }
}

module.exports = {getUpdates$}
