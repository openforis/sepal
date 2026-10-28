import {map, throwError} from 'rxjs'

import * as http from '#sepal/httpClient'

// Reads a recipe from the Recipe module as a named user, which applies its own ownership policy to it. The
// principal is the one an authenticated boundary established, never one derived from the recipe being read
// or from the arguments of the request asking for it.
export const createRecipeReader = ({recipeEndpoint, principal}) => id =>
    isAuthenticated(principal)
        ? http.get$(`${recipeEndpoint}/${id}`, {
            headers: {'sepal-user': JSON.stringify(principal)},
            responseType: 'json'
        }).pipe(
            map(({body}) => body)
        )
        // Nothing is requested at all: an operation that cannot name its user has no authority to read
        // with, and falling back to the service credentials of its process is what this replaces.
        : throwError(() => new Error('Cannot read a recipe without the authenticated user of the request'))

const isAuthenticated = principal =>
    typeof principal?.username === 'string' && principal.username.length > 0
