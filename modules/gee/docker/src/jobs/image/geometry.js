const ee = require('@google/earthengine')
const job = require('root/worker/job')

const worker$ = ({recipe, color = '#FFFFFF50', fillColor = '#FFFFFF08'}) => {
    const ImageFactory = require('root/ee/imageFactory')
    const {getInfo$, getMap$} = require('root/ee/utils')
    const {forkJoin} = require('rxjs')
    const {map, switchMap} = require('rxjs/operators')

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            const table = ee.FeatureCollection([ee.Feature(geometry)])
            const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
            return forkJoin({
                bounds: getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)])),
                eeMap: getMap$(table.style({color, fillColor}))
            }).pipe(
                map(({bounds, eeMap}) => ({bounds, ...eeMap}))
            )
        })
    )
}

module.exports = job({
    jobName: 'EE geometry',
    jobPath: __filename,
    before: [require('root/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
