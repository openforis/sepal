const {map} = require('rx/operators')
const {Storage} = require('@google-cloud/storage')
const {getContext$} = require('root/jobs/service/context')

const cloudStorage$ = () =>
    getContext$().pipe(
        map(({config}) =>
            new Storage({
                credentials: config.serviceAccountCredentials,
                projectId: config.googleProjectId
            }))
    )

module.exports = {cloudStorage$}
