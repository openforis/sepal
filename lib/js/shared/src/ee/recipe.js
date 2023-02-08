const {context} = require('#sepal/context')
const {map} = require('rxjs')
const http = require('#sepal/httpClient')

const loadRecipe$ = id =>
    http.get$(`${context().sepalEndpoint}/api/processing-recipes/${id}`, {
        username: context().sepalUsername,
        password: context().sepalPassword
    }).pipe(
        map(response => JSON.parse(response.body))
    )

module.exports = {loadRecipe$}
