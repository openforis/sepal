const {concat, forkJoin, switchMap} = require('rxjs')
const moment = require('moment')
const {mkdirSafe$} = require('#task/rxjs/fileSystem')
const {createVrt$, setBandNames$} = require('#sepal/gdal')
const {exportImageToSepal$} = require('../jobs/export/toSepal')
const ImageFactory = require('#sepal/ee/imageFactory')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {setWorkloadTag} = require('./workloadTag')

module.exports = {
    submit$: (taskId, {image: {recipe, workspacePath, bands, filenamePrefix, ...retrieveOptions}}) => {
        setWorkloadTag(recipe)
        return getCurrentContext$().pipe(
            switchMap(({config}) => {
                const description = recipe.title || recipe.placeholder
                const exportPrefix = filenamePrefix || description
                const preferredDownloadDir = workspacePath
                    ? `${config.homeDir}/${workspacePath}/`
                    : `${config.homeDir}/downloads/${description}/`
                return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
                    switchMap(downloadDir => concat(
                        export$(taskId, {description, exportPrefix, recipe, downloadDir, bands, ...retrieveOptions}),
                        postProcess$({description: exportPrefix, downloadDir, bands})
                    )
                    )
                )
            })
        )
    }
}

const export$ = (taskId, {description, exportPrefix, recipe, bands, scale, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, bands)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) =>
            exportImageToSepal$(taskId, {
                image,
                folder: `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`,
                ...retrieveOptions,
                description: exportPrefix,
                region: geometry.bounds(scale),
                scale
            })
        )
    )
}

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
