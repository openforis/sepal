import {google} from 'googleapis'
import {catchError, from, map, switchMap, throwError} from 'rxjs'
import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {ClientException, ERROR_CODES} from '#sepal/exception'

const __filename = fileURLToPath(import.meta.url)

const REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/cloudplatformprojects.readonly',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/earthengine'
]

const worker$ = ({
    credentials: {sepalUser}
}) => {
    const {EE_NOT_AVAILABLE, MISSING_OAUTH_SCOPES, MISSING_GOOGLE_TOKENS} = ERROR_CODES

    const accessToken = sepalUser?.googleTokens?.accessToken
    
    if (accessToken) {
        const oAuth2Client = new google.auth.OAuth2()
        oAuth2Client.setCredentials({
            access_token: accessToken
        })
        
        const testEEInteraction = () =>
            ee.getInfo$(ee.Image(), 'can communicate with EE servers').pipe(
                catchError(cause => {throw new ClientException('Failed to communicate with EE', {cause, errorCode: EE_NOT_AVAILABLE})})
            )
    
        return from(oAuth2Client.getTokenInfo(accessToken)).pipe(
            switchMap(({scopes}) => {
                const hasAllScopes = REQUIRED_SCOPES.every(requiredScope => scopes.includes(requiredScope))
                return hasAllScopes
                    ? testEEInteraction()
                    : throwError(() => new ClientException('Doesn\'t have all scopes', {errorCode: MISSING_OAUTH_SCOPES}))
            }),
            map(() => ({'status': 'OK'}))
        )
    } else {
        return throwError(() => new ClientException('Doesn\'t have Google tokens', {errorCode: MISSING_GOOGLE_TOKENS}))
    }

}

export default job({
    jobName: 'EE check',
    jobPath: __filename,
    worker$
})
