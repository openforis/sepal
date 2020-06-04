const {exportImageToAsset$} = require('root/ee/export/toAsset')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const description = recipe.title || recipe.placeholder
        const imageDef = {recipe, bands}
        return export$({imageDef, description, scale})
    }
}

const export$ = ({imageDef, description, scale}) =>
    exportImageToAsset$({
        imageDef, description, scale, crs: 'EPSG:4326', maxPixels: 1e13
    })
