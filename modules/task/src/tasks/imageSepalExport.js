const {concat, switchMap} = require('rxjs')
const moment = require('moment')
const {mkdirSafe$} = require('task/rxjs/fileSystem')
const {createVrt$, setBandNames$} = require('sepal/gdal')
const {exportImageToSepal$} = require('../jobs/export/toSepal')
const ImageFactory = require('sepal/ee/imageFactory')
const {getCurrentContext$} = require('task/jobs/service/context')

module.exports = {
    submit$: (id, {image: {recipe, workspacePath, bands, ...retrieveOptions}}) =>
        getCurrentContext$().pipe(
            switchMap(({config}) => {
                const description = recipe.title || recipe.placeholder
                const preferredDownloadDir = workspacePath
                    ? `${config.homeDir}/${workspacePath}/`
                    : `${config.homeDir}/downloads/${description}/`
                return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
                    switchMap(downloadDir =>
                        concat(
                            export$({description, recipe, downloadDir, ...retrieveOptions}),
                            postProcess$({description, downloadDir, bands})
                        )
                    )
                )
            })
        )
}

const export$ = ({description, recipe, bands, ...retrieveOptions}) =>
    ImageFactory(recipe, bands).getImage$().pipe(
        switchMap(image =>
            exportImageToSepal$({
                image,
                folder: `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`,
                description,
                ...retrieveOptions
            })
        )
    )

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
