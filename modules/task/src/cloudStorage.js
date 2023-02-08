const {map} = require('rxjs')
const {Storage} = require('@google-cloud/storage')
const {getCurrentContext$} = require('#task/jobs/service/context')

const cloudStorage$ = () =>
    getCurrentContext$().pipe(
        map(({config}) =>
            new Storage({
                credentials: config.serviceAccountCredentials,
                projectId: config.googleProjectId
            }))
    )

module.exports = {cloudStorage$}
