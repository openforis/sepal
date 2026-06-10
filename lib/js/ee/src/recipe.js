import {map} from 'rxjs'

import {context} from '#sepal/context'
import * as http from '#sepal/httpClient'

const loadRecipe$ = id =>
    http.get$(`${context().sepalEndpoint}/api/processing-recipes/${id}`, {
        username: context().sepalUsername,
        password: context().sepalPassword
    }).pipe(
        map(response => JSON.parse(response.body))
    )

export {loadRecipe$}
