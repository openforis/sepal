const {forkJoin, switchMap} = require('rxjs')
const moment = require('moment')
const {mkdirSafe$} = require('#task/rxjs/fileSystem')
const {exportImageToDrive$} = require('../jobs/export/toDrive')
const ImageFactory = require('#sepal/ee/imageFactory')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {setWorkloadTag} = require('./workloadTag')

module.exports = {
    submit$: (taskId, {image: {recipe, workspacePath, bands, ...retrieveOptions}}) => {
        setWorkloadTag(recipe)
        return getCurrentContext$().pipe(
            switchMap(({config}) => {
                const description = recipe.title || recipe.placeholder
                const preferredDownloadDir = workspacePath
                    ? `${config.homeDir}/${workspacePath}/`
                    : `${config.homeDir}/downloads/${description}/`
                return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
                    switchMap(downloadDir =>
                        export$(taskId, {description, recipe, downloadDir, bands, ...retrieveOptions})
                    )
                )
            })
        )
    }
}

const export$ = (taskId, {description, recipe, bands, scale, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, bands)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) =>
            exportImageToDrive$(taskId, {
                image,
                folder: `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`,
                ...retrieveOptions,
                description,
                region: geometry.bounds(scale),
                scale
            })
        )
    )
}
