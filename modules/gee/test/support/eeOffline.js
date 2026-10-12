import ee from '#sepal/ee/ee'

// Earth Engine without a network: the client library's own requests are answered from here, and it is
// initialized from a registry of just the algorithms these tests build with.

export const TEST_PROJECT = 'sepal-test-project'
export const API = 'https://earthengine.googleapis.com'

// The library's mock transport looks answers up by the exact URL it sends, with the legacy project path
// removed. A URL without an answer throws inside the library's request timer, outside any test, so every
// URL a test makes the library send to must be answered.
export const libraryKey = url => url.replace('v1/projects/earthengine-legacy/', '')

export const algorithmsAnswer = () => ({
    [`${API}/v1/projects/${TEST_PROJECT}/algorithms?prettyPrint=false`]: {algorithms: ALGORITHMS}
})

// Replaces every answer given before. Returns the requests the library sends, as it sends them.
export const answerLibrary = answers => {
    const requests = []
    ee.data.setupMockSend(Object.fromEntries(
        Object.entries(answers).map(([url, answer]) => [
            libraryKey(url),
            (sentUrl, method, data, headers) => {
                requests.push({method, url: sentUrl, body: data ? JSON.parse(data) : undefined, headers})
                return JSON.stringify(answer)
            }
        ])
    ))
    return requests
}

export const initializeOfflineEE = async () => {
    answerLibrary(algorithmsAnswer())
    ee.data.setAuthToken(null, 'Bearer', 'offline-token', null, null, null, false)
    await new Promise((resolve, reject) =>
        ee.initialize(null, null, resolve, error => reject(new Error(error)), null, TEST_PROJECT)
    )
    return ee
}

const algorithm = (name, returnType, args) => ({
    name: `algorithms/${name}`,
    description: '',
    returnType,
    arguments: args.map(([argumentName, type, optional = false]) => ({argumentName, type, optional, description: ''}))
})

const ALGORITHMS = [
    algorithm('Image.load', 'Image', [['id', 'String'], ['version', 'Long', true]]),
    algorithm('Image.clipToBoundsAndScale', 'Image', [
        ['input', 'Image'], ['geometry', 'Geometry', true], ['width', 'Integer', true], ['height', 'Integer', true],
        ['maxDimension', 'Integer', true], ['scale', 'Float', true]
    ]),
    algorithm('GeometryConstructors.Polygon', 'Geometry', [
        ['coordinates', 'Object'], ['crs', 'Projection', true], ['geodesic', 'Boolean', true],
        ['maxError', 'ErrorMargin', true], ['evenOdd', 'Boolean', true]
    ]),
    algorithm('Image.loadGeoTIFF', 'Image', [['uri', 'String']]),
    algorithm('Image.select', 'Image', [['input', 'Image'], ['bandSelectors', 'List'], ['newNames', 'List', true]]),
    algorithm('Image.visualize', 'Image', [
        ['image', 'Image'], ['bands', 'Object', true], ['gain', 'Object', true], ['bias', 'Object', true],
        ['min', 'Object', true], ['max', 'Object', true], ['gamma', 'Object', true], ['opacity', 'Number', true],
        ['palette', 'Object', true], ['forceRgbOutput', 'Boolean', true]
    ]),
    algorithm('Collection.loadTable', 'FeatureCollection', [['tableId', 'Object'], ['geometryColumn', 'String', true], ['version', 'Long', true]])
]
