import {MISSING_INPUT_BAND} from '#sepal/recipe/output/diagnostic'

// The inputs of a Stack its current output read finds lacking bands they map, in model order: [{imageId, name, bands}],
// `name` what the inputs list calls it - its recipe's name, or its asset's id. Only a read refused for that says so, and
// only a diagnosis this recipe owns. Stack refuses a band where its mapping names it (lib/js/shared/src/recipe/type/
// stack.js): the band names entry, which knows its input by imageId, located in the configuration the read was made
// from - the current one.
export const inputBandProblems = ({recipe, output, recipeNames = {}}) => {
    const images = recipe?.model?.inputImagery?.images || []
    const entries = recipe?.model?.bandNames?.bandNames || []
    const missingByImageId = new Map()
    ;(output?.diagnostics || [])
        .filter(diagnostic => diagnostic.code === MISSING_INPUT_BAND && ownedBy(diagnostic, recipe))
        .forEach(({path}) => {
            const [, , , entryIndex, , bandIndex] = path
            const entry = entries[entryIndex]
            const band = entry?.bands?.[bandIndex]
            if (band) {
                missingByImageId.set(entry.imageId, [...(missingByImageId.get(entry.imageId) || []), band.originalName])
            }
        })
    return images
        .filter(({imageId}) => missingByImageId.has(imageId))
        .map(image => ({imageId: image.imageId, name: nameOf(image, recipeNames), bands: missingByImageId.get(image.imageId)}))
}

const ownedBy = ({recipePath = []}, recipe) =>
    recipePath.length === 1 && recipePath[0] === recipe.id

const nameOf = ({type, id}, recipeNames) =>
    type === 'RECIPE_REF' ? recipeNames[id] || id : id
