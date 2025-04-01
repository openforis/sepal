const {setWorkloadTag} = require('../workloadTag')

module.exports = {
    submit$: (taskId, {workspacePath, description, ...retrieveOptions}) => {
        console.log('samplesSepalExport', {taskId, workspacePath, description, retrieveOptions})
        // setWorkloadTag(retrieveOptions.recipe)
        // return getCurrentContext$().pipe(
        //     switchMap(({config}) => {
        //         const preferredDownloadDir = workspacePath
        //             ? `${config.homeDir}/${workspacePath}/`
        //             : `${config.homeDir}/downloads/${description}/`
        //         return mkdirSafe$(preferredDownloadDir, {recursive: true}).pipe(
        //             switchMap(downloadDir => export$(taskId, {description, downloadDir, ...retrieveOptions})
        //             )
        //         )
        //     })
        // )
    }
}
