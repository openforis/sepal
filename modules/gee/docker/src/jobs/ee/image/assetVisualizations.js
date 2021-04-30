const {job} = require('root/jobs/job')

const worker$ = ({asset}) => {
    const ee = require('ee')
    const {map} = require('rx/operators')
    const log = require('sepal/log').getLogger('ee')
    const {v4: guid} = require('uuid')

    const extractVisualization = (image, i) => {
        const properties = image
            .toDictionary()
            .select(
                image.propertyNames().map(function (name) {
                    return ee.String(name).match('^visualization_\\d+_.*')
                }).flatten()
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
                image.propertyNames().map(function (name) {
                    return ee.String(name).match('^visualization_\\d+_.*')
                }).flatten()
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
        const set = (key, transform) => {
            if (Object.keys(visualization).includes(key)) {
                try {
                    visParams[key] = transform(visualization[key])
                } catch(error) {
                    log.warn(`Failed to parse visualization parameter '${key}' from $${asset}: ${error}`)
                }
            }
        }

        ['name', 'type'].forEach(key => set(key, value =>
            value.trim())
        );
        ['bands', 'palette', 'labels'].forEach(key => set(key, value =>
            value.split(',').map(value => value.trim()))
        );
        ['min', 'max', 'gamma', 'values'].forEach(key => set(key, value =>
            value.split(',').map(value => parseFloat(value.trim())))
        )
        return visParams
    }

    const formatVisualizations = visualizations =>
        visualizations.map(formatVisualization)

    return ee.getInfo$(extractVisualizations(ee.Image(asset)), 'asset visualizations').pipe(
        map(formatVisualizations)
    )

}

module.exports = job({
    jobName: 'EE image asset visualizations',
    jobPath: __filename,
    worker$
})
