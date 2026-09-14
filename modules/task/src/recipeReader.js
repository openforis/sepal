import {map} from 'rxjs'

import * as http from '#sepal/httpClient'

// A task reads recipes through the gateway, as the account its sandbox was started with.
export const createRecipeReader = ({sepalEndpoint, sepalUsername, sepalPassword}) => id =>
    http.get$(`${sepalEndpoint}/api/processing-recipes/${id}`, {
        username: sepalUsername,
        password: sepalPassword,
        responseType: 'json'
    }).pipe(
        map(({body}) => body)
    )
