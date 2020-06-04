const {concat} = require('rxjs')
const {switchMap} = require('rxjs/operators')
const moment = require('moment')
const {mkdirSafe$} = require('root/rxjs/fileSystem')
const {createVrt$, setBandNames$} = require('sepal/gdal')
const {exportImageDefToSepal$} = require('root/ee/export/toSepal')
const config = require('root/config')

module.exports = {
    submit$: (id, {image: {recipe, bands, scale}}) => {
        const description = recipe.title || recipe.placeholder
        const preferredDownloadDir = `${config.homeDir}/downloads/${description}/`
        return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
            switchMap(downloadDir => {
                return concat(
                    export$({description, downloadDir, recipe, bands, scale}),
                    postProcess$({description, downloadDir, bands})
                )
            })
        )
    }
}

const export$ = ({description, downloadDir, recipe, bands, scale}) =>
    exportImageDefToSepal$({
        imageDef: {recipe, bands},
        folder: `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`,
        description, downloadDir, scale, crs: 'EPSG:4326'
    })

const postProcess$ = ({description, downloadDir, bands}) => {
    const vrtPath = `${downloadDir}/${description}.vrt`
    return concat(
        createVrt$({
            inputPaths: `${downloadDir}/*.tif`,
            outputPath: vrtPath
        }),
        setBandNames$(vrtPath, bands.selection)
    )
}
