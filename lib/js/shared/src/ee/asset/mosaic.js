const imageCollectionAsset = require('./imageCollectionAsset')
const imageAsset = require('./imageAsset')

const mosaic = recipe => {
    const type = recipe?.model?.assetDetails?.type
    switch (type) {
    case 'Image': return imageAsset(recipe)
    case 'ImageCollection': return imageCollectionAsset(recipe)
    default: throw new Error(`Invalid asset type: ${type}`)
    }
}

module.exports = mosaic
