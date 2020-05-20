const {concat} = require('rxjs')
const {map, switchMap} = require('rxjs/operators')
const ImageFactory = require('sepal/ee/imageFactory')
const {createVrt$, setBandNames$} = require('sepal/gdal')
const {exportImageToSepal$} = require('root/ee/export')
const progress = require('root/progress')
const config = require('root/config')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const description = recipe.title || recipe.placeholder
        const downloadDir = `${config.homeDir}/downloads/${description}/`
        return concat(
            export$({description, downloadDir, recipe, bands, scale}),
            // postProcess$({description, downloadDir, bands})
        )
    }
}

const export$ = ({description, downloadDir, recipe, bands, scale}) => {
    const {getImage$} = ImageFactory(recipe, bands)
    return getImage$().pipe(
        switchMap(image => exportImageToSepal$({
            image, description, downloadDir, scale, crs: 'EPSG:4326'
        }))
    )
}

const postProcess$ = ({description, downloadDir, bands}) => {
    const vrtPath = `${downloadDir}/${description}.vrt`
    return concat(
        createVrt$({
            inputPaths: `${downloadDir}/*.tif`,
            outputPath: vrtPath
        }),
        setBandNames$({
            path: vrtPath,
            bandNames: bands.selection
        })
    )
}
