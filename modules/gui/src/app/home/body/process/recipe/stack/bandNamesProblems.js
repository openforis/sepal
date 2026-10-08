import {DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT, UNMAPPED_INPUT} from '#sepal/recipe/output/diagnostic'
import {msg} from '~/translate'

import {invalidBandNameFormat} from './bandNameFormat'

// What needs repair in a Stack's band names, by the input each belongs to, in model order:
// [{imageId, name, code, outputName}], `name` what the inputs list calls the input. What the current output read
// refuses, where this recipe owns the diagnosis and it is established from the configuration alone
// (lib/js/shared/src/recipe/type/stack.js): a final name already taken, a blank name, or an input its mapping does not
// name. And a name the Band names fields refuse as written (bandNameFormat.js), which the declaration leaves to them.
// Each is repaired where the band names are edited.
export const bandNamesProblems = ({recipe, output, recipeNames = {}}) => {
    const images = recipe?.model?.inputImagery?.images || []
    const entries = recipe?.model?.bandNames?.bandNames || []
    const refused = (output?.diagnostics || [])
        .filter(diagnostic => CODES.has(diagnostic.code) && ownedBy(diagnostic, recipe))
        .map(({code, path}) => {
            if (code === UNMAPPED_INPUT) {
                return {imageId: images[path[3]]?.imageId, code}
            }
            const [, , , entryIndex, , bandIndex] = path
            const entry = entries[entryIndex]
            return {imageId: entry?.imageId, code, outputName: entry?.bands?.[bandIndex]?.outputName}
        })
    const misspelled = entries.flatMap(({imageId, bands = []}) => bands
        .filter(({outputName}) => invalidBandNameFormat(outputName))
        .map(({outputName}) => ({imageId, code: INVALID_FORMAT, outputName})))
    return images.flatMap(image => [...refused, ...misspelled]
        .filter(({imageId}) => imageId === image.imageId)
        .map(problem => ({...problem, name: nameOf(image, recipeNames)})))
}

export const bandNamesProblemMessage = ({code, outputName}) =>
    msg(`process.stack.panel.bandNames.problem.${MESSAGES[code]}`, {outputName})

const CODES = new Set([DUPLICATE_BAND_NAME, INCOMPLETE_IMAGE_OUTPUT, UNMAPPED_INPUT])
const INVALID_FORMAT = 'INVALID_FORMAT'

const MESSAGES = {
    [DUPLICATE_BAND_NAME]: 'duplicate',
    [INCOMPLETE_IMAGE_OUTPUT]: 'blank',
    [UNMAPPED_INPUT]: 'unmapped',
    [INVALID_FORMAT]: 'invalidFormat'
}

const ownedBy = ({recipePath = []}, recipe) =>
    recipePath.length === 1 && recipePath[0] === recipe.id

const nameOf = ({type, id}, recipeNames) =>
    type === 'RECIPE_REF' ? recipeNames[id] || id : id
