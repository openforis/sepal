const {job} = require('#gee/jobs/job')

const PROBABILITY_THRESHOLD = 75
const NUMBER_OF_POINTS = 5

const worker$ = recipe => {
    const ee = require('#sepal/ee/ee')
    const {map, switchMap} = require('rxjs')
    const classify = require('#sepal/ee/classification/classification')
    const {getRows$} = require('#sepal/ee/table')
    const _ = require('lodash')

    const overrideClassifierType = () => {
        const type = recipe.model.classifier.type
        const overriddenType = ['RANDOM_FOREST', 'CART'].includes(type) ? type : 'CART'
        return _.merge(recipe, {model: {classifier: {type: overriddenType}}})
    }
    const classification = classify(overrideClassifierType(), {selection: ['class', 'class_probability']})
    return classification.getImage$().pipe(
        map(image =>
            image
                .select('class')
                .updateMask(image.select('class_probability').lt(PROBABILITY_THRESHOLD))
                .stratifiedSample({
                    numPoints: NUMBER_OF_POINTS,
                    classBand: 'class',
                    scale: 30,
                    geometries: true,
                    tileScale: 16
                })
        ),
        switchMap(points =>
            getRows$(
                points.map(function (point) {
                    const coordinates = point.geometry().coordinates()
                    return ee.Feature(null, {x: coordinates.getNumber(0), y: coordinates.getNumber(1)})
                })
            )),
        map(points => _.shuffle(points.features.map(({properties}) => properties)))
    )
}

module.exports = job({
    jobName: 'NextReferenceDataPoints',
    jobPath: __filename,
    worker$
})
