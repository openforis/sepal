const imageCollectionAsset = require('./imageCollectionAsset')
const imageAsset = require('./imageAsset')

const mosaic = (recipe, ...args) => {
    const type = recipe?.model?.assetDetails?.type
    switch (type) {
    case 'Image': return imageAsset(recipe, ...args)
    case 'ImageCollection': return imageCollectionAsset(recipe, ...args)
    default: throw new Error(`Invalid asset type: ${type}`)
    }
}

module.exports = mosaic
