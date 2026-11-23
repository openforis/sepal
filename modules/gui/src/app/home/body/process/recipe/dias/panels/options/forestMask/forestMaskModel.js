// The forest mask the options hold as `forestMask` - NONE, HANSEN with its threshold, or an ASSET or RECIPE_REF image -
// and the form values choosing it, where an image is chosen as SOURCE with its kind.
export const forestMaskToValues = ({type, id, threshold} = {}) => {
    switch (type) {
        case 'NONE':
            return {forestMaskType: type}
        case 'HANSEN':
            return {forestMaskType: type, forestMaskThreshold: threshold}
        case 'ASSET':
            return {forestMaskType: 'SOURCE', forestMaskSourceType: type, forestMaskAsset: id}
        case 'RECIPE_REF':
            return {forestMaskType: 'SOURCE', forestMaskSourceType: type, forestMaskRecipe: id}
        default:
            return {}
    }
}

export const toForestMask = ({forestMaskType, forestMaskSourceType, forestMaskAsset, forestMaskRecipe, forestMaskThreshold}) => {
    switch (forestMaskType) {
        case 'HANSEN':
            return {type: forestMaskType, threshold: forestMaskThreshold}
        case 'SOURCE':
            return forestMaskSourceType === 'RECIPE_REF'
                ? {type: forestMaskSourceType, id: forestMaskRecipe}
                : {type: forestMaskSourceType, id: forestMaskAsset}
        default:
            return {type: 'NONE'}
    }
}
