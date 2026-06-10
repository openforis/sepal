import _ from 'lodash'
import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import classify from '#sepal/ee/classification/classification'
import ee from '#sepal/ee/ee'
import {getRows$} from '#sepal/ee/table'
import {fileName} from '#sepal/path'

const PROBABILITY_THRESHOLD = 75
const NUMBER_OF_POINTS = 5

const worker$ = ({
    requestArgs: recipe
}) => {

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
                    // tileScale: 16
                })
        ),
        switchMap(points =>
            getRows$(
                points.map(point => {
                    const coordinates = point.geometry().coordinates()
                    return ee.Feature(null, {x: coordinates.getNumber(0), y: coordinates.getNumber(1)})
                })
            )),
        map(points => _.shuffle(points.features.map(({properties}) => properties)))
    )
}

export default job({
    jobName: 'NextReferenceDataPoints',
    jobPath: fileName(import.meta.url),
    worker$
})
