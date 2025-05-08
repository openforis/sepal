const {job} = require('#gee/jobs/job')

const worker$ = ({recipe, color = '#FFFFFF50', fillColor = '#FFFFFF08'}) => {
    const ee = require('#sepal/ee')
    const ImageFactory = require('#sepal/ee/imageFactory')
    const {switchMap} = require('rxjs')

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            const table = ee.FeatureCollection([ee.Feature(geometry)])
            return ee.getMap$(table.style({color, fillColor}), null, 'create geometry map')
        })
    )
}

module.exports = job({
    jobName: 'Geometry',
    jobPath: __filename,
    worker$
})
