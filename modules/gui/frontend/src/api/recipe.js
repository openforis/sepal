import {delete$, get$, post$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadAll$: () =>
        get$('/api/processing-recipes')
            .pipe(toResponse),
    save$: ({id, type, name, gzippedContents}) =>
        post$(`/api/processing-recipes/${id}`, {
            query: {type, name},
            body: gzippedContents,
            headers: {'Content-Type': 'application/octet-stream'}
        }).pipe(toResponse),
    delete$: recipeId =>
        delete$(`/api/processing-recipes/${recipeId}`),
    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`)
            .pipe(toResponse),
}

const toResponse = map(e => e.response)
