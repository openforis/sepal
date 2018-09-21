import {delete$, get$, post$} from 'http-client'
import {gzip$} from 'gzip'
import {map, switchMap} from 'rxjs/operators'
import _ from 'lodash'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes')
            .pipe(toResponse),
    save$: (recipe) => {
        const name = recipe.title || recipe.placeholder
        return gzip$(_.omit(recipe, ['ui'])).pipe(
            switchMap(contents =>
                post$(`/api/processing-recipes/${recipe.id}`, {
                    query: {type: recipe.type, name: name},
                    body: contents,
                    headers: {'Content-Type': 'application/octet-stream'}
                })
            ),
            map(() => recipe)
        )
    },
    delete$: (recipeId) =>
        delete$(`/api/processing-recipes/${recipeId}`),
    load$: (recipeId) =>
        get$(`/api/processing-recipes/${recipeId}`)
            .pipe(toResponse),
}

const toResponse = map(e => e.response)
