const {job} = require('root/jobs/job')

const worker$ = ({asset, recipe}) => {
    const {of} = require('rx')
    const {map, switchMap} = require('rx/operators')
    const ImageFactory = require('sepal/ee/imageFactory')
    const ee = require('ee')

    const image$ = asset
        ? of(ee.Image(asset))
        : ImageFactory(recipe).getImage$()
    return image$.pipe(
        switchMap(image => ee.getInfo$(image, 'get image metadata')),
        map(({bands, properties}) => {
            const dataTypes = {}
            bands.forEach(({id, data_type: {precision, min, max}}) => dataTypes[id] = {precision, min, max})
            return {
                bands: bands.map(({id}) => id),
                dataTypes,
                properties
            }
        })
    )
}

module.exports = job({
    jobName: 'EE image metadata',
    jobPath: __filename,
    worker$
})
