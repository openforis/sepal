import {MISSING_INPUT_BAND} from '#sepal/recipe/output/diagnostic'
import {msg} from '~/translate'

// The inputs of a Band Math recipe its current output read establishes are missing bands they include, in model order:
// [{imageId, name, bands}]. Only a read refused for that says so - one pending, unavailable or ready establishes nothing -
// and only a diagnosis this recipe owns: one an upstream recipe owns names that recipe's configuration, not an input of
// this one. A diagnosis is located in the configuration the read was made from, which is the current one, and is
// resolved against it, so each input is the one at that location, known by its imageId.
export const inputBandProblems = ({recipe, output}) => {
    const images = recipe?.model?.inputImagery?.images || []
    const owned = (output?.diagnostics || [])
        .filter(diagnostic => diagnostic.code === MISSING_INPUT_BAND && ownedBy(diagnostic, recipe))
    const missingByImageId = new Map()
    owned.forEach(({path}) => {
        const [, , , imageIndex, , bandIndex] = path
        const image = images[imageIndex]
        const band = image?.includedBands?.[bandIndex]
        if (band) {
            missingByImageId.set(image.imageId, [...(missingByImageId.get(image.imageId) || []), band.name])
        }
    })
    return images
        .filter(({imageId}) => missingByImageId.has(imageId))
        .map(({imageId, name}) => ({imageId, name, bands: missingByImageId.get(imageId)}))
}

const ownedBy = ({recipePath = []}, recipe) =>
    recipePath.length === 1 && recipePath[0] === recipe.id

// What an input's problem says of it.
export const missingBandsMessage = ({bands}) =>
    msg('process.bandMath.requirement.missingInputBands', {bands: bands.join(', ')})
