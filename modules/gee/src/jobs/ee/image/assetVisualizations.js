const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {asset}
}) => {
    const ee = require('#sepal/ee/ee')
    const {map, switchMap} = require('rxjs')
    const {v4: guid} = require('uuid')
    const ImageFactory = require('#sepal/ee/imageFactory')

    const extractLandcover = image => {
        const properties = image.toDictionary()

        const getList = key => properties
            .select(
                image.propertyNames().map(name => ee.String(name).match(`^landcover_class_${key}`)).flatten()
            )
            .values()

        const valuesList = getList('values')
        const palette = getList('palette').flatten()
        const labels = getList('names').flatten()

        return valuesList.map(values => ({
            type: 'categorical',
            bands: image.bandNames().get(0), // No way to know which band is the categorical. Take first.
            labels,
            values,
            palette
        }))
    }

    const extractVisualization = (image, i) => {
        const properties = image
            .toDictionary()
            .select(
                image.propertyNames().map(name => ee.String(name).match('^visualization_\\d+_.*')).flatten()
            )

        const indexProperties = properties
            .select([
                ee.String('^visualization_')
                    .cat(ee.Number(i).format())
                    .cat('_.*')
            ])
        return indexProperties
            .keys()
            .iterate((name, acc) => {
                name = ee.String(name)
                const key = name
                    .match('^visualization_\\d+_(.*)')
                    .getString(1)
                const value = indexProperties.get(name)
                return ee.Dictionary(acc).set(key, value)
            }, ee.Dictionary())
    }

    const extractVisualizations = image => {
        const properties = image
            .toDictionary()
            .select(
                image.propertyNames().map(name => ee.String(name).match('^visualization_\\d+_.*')).flatten()
            )
        const indexes = properties
            .keys()
            .map(name => ee.Number.parse(
                ee.String(name)
                    .match('^visualization_(\\d+)_.*')
                    .get(1)
            ))
            .distinct()
        return indexes.map(i => extractVisualization(image, i))
    }

    const formatVisualization = visualization => {
        const visParams = {id: guid()}
        const set = (key, transform = value => value) => {
            if (Object.keys(visualization).includes(key)) {
                const value = transform(visualization[key])
                const transformedValue = transform(
                    typeof value === 'string'
                        ? value.trim()
                        : value
                )
                visParams[key] = transformedValue
                return transformedValue
            } else {
                return null
            }
        }

        const toList = value => {
            if (value === undefined || value === null) {
                return []
            } else if ((Array.isArray(value))) {
                return value
            } else if (typeof value === 'number') {
                return [value]
            } else if (typeof value === 'string') {
                return value.split(',').map(s => s.trim())
            }
        }

        const toNumberList = value =>
            toList(value).map(value =>
                typeof value === 'string'
                    ? parseFloat(value)
                    : value
            )

        const adjustSize = (list, size) => {
            if (!list || !list.length) {
                return null
            } else if (list.length > size) {
                return list.slice(0, size)
            } else if (list.length < size) {
                const neededElements = size - list.length
                const additionalElements = Array(neededElements).fill(list[list.length - 1])
                return list.concat(additionalElements)
            } else {
                return list
            }
        }

        const bands = set('bands', toList)
        const numberOfBands = bands.length
        visParams.type = visualization.type || (numberOfBands > 1 ? 'rgb' : 'continuous')

        set('name');
        ['palette', 'labels'].forEach(key => set(key, toList));
        ['min', 'max', 'gamma', 'values'].forEach(key => set(key, value =>
            adjustSize(
                toNumberList(value),
                numberOfBands
            )
        ))
        if (Object.keys(visualization).includes('values')) {
            visParams.values = toNumberList(visualization.values)
        }
        set('inverted', value =>
            toList(value).map(inverted => inverted === 'true' || inverted === true)
        )
        return visParams
    }

    const formatVisualizations = visualizations =>
        visualizations.map(formatVisualization)

    ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
        switchMap(image =>
            ee.getInfo$(
                extractVisualizations(image).cat(extractLandcover(image)),
                'asset visualizations'
            ),
        map(formatVisualizations)
        )
    ).getImage$()
}

module.exports = job({
    jobName: 'EE image asset visualizations',
    jobPath: __filename,
    worker$
})
