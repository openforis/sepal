import {map, switchMap, throwError} from 'rxjs'

import imageFactory from '#sepal/ee/imageFactory'
import {calculateIndex} from '#sepal/ee/optical/indexes'
import {REQUIRED_BANDS_BY_INDEX} from '#sepal/recipe/optical/opticalBands'
import {RECIPE_REF} from '#sepal/recipe/source/reference'
import {baselineIndexSource, CALCULATED_INDEX, PROVIDED_INDEX} from '#sepal/recipe/type/pyeoAlerts'

// Baseline and monitoring gate_index are int16 ×INDEX_SCALE - the scale getCollection$ gives indices - so they compare
// directly; the gate's threshold is scaled to match.
export const INDEX_SCALE = 10000

// The gate's index of the Classification's one input image, as `gate_index`, obtained as readiness judges it can be
// (baselineIndexSource). An asset's is calculated of its spectral bands. A recipe's is its own band of that name where it
// provides one - stored at INDEX_SCALE already - and otherwise calculated of the spectral bands it outputs, by the names
// its declaration gives them (getBands$), selected alone.
export const baselineGateIndex$ = (input, index) =>
    input.type === RECIPE_REF
        ? imageFactory(input).getBands$().pipe(
            switchMap(bands => recipeGateIndex$(input, index, baselineIndexSource({type: input.type, bands}, index)))
        )
        : imageFactory(input).getImage$().pipe(map(image => calculated(image, index)))

const recipeGateIndex$ = (input, index, source) => {
    if (source === PROVIDED_INDEX) {
        return imageFactory(input, {selection: [index]}).getImage$().pipe(
            map(image => image.select([index], ['gate_index']))
        )
    }
    if (source === CALCULATED_INDEX) {
        return imageFactory(input, {selection: REQUIRED_BANDS_BY_INDEX[index]}).getImage$().pipe(
            map(image => calculated(image, index))
        )
    }
    return throwError(() => new Error(`pyeoAlerts: the classification's input provides neither ${index} nor the bands it is calculated of`))
}

const calculated = (image, index) =>
    calculateIndex(image, index).multiply(INDEX_SCALE).int16().rename('gate_index')
