import {map} from 'rxjs'

import * as http from '#sepal/httpClient'

import {sessionAuth} from './sessionAuth.js'

// A task reads recipes through the gateway as the worker session it runs as, which the gateway
// resolves to the session's owning user. Recipe applies its ownership policy to that user.
export const createRecipeReader = ({sepalEndpoint, sepalApiKey}) => id =>
    http.get$(`${sepalEndpoint}/api/processing-recipes/${id}`, {
        ...sessionAuth(sepalApiKey),
        responseType: 'json'
    }).pipe(
        map(({body}) => body)
    )
