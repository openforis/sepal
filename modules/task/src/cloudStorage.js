import {map} from 'rxjs'
import {Storage} from '@google-cloud/storage'
import {getCurrentContext$} from '#task/jobs/service/context'

const cloudStorage$ = () =>
    getCurrentContext$().pipe(
        map(({config}) =>
            new Storage({
                credentials: config.serviceAccountCredentials,
                projectId: config.googleProjectId
            }))
    )

export {cloudStorage$}
