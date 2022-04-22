import {delete$, get$, postBinary$} from 'http-client'
import {of} from 'rxjs'

import {v4 as uuid} from 'uuid'

const recipes = []
for (let i = 0; i < 100; i++) {
    recipes.push({id: uuid(), name: uuid(), type: 'CCDC', creationTime: '2022-03-17T14:42:29+0000', updateTime: '2022-04-06T14:46:57+0000'})
}

export default {
    loadAll$: () =>
        get$('/api/processing-recipes'),
    // of(recipes),

    save$: ({id, type, name, gzippedContents}) =>
        postBinary$(`/api/processing-recipes/${id}`, {
            query: {type, name},
            body: gzippedContents
        }),

    delete$: recipeId =>
        delete$(`/api/processing-recipes/${recipeId}`),

    load$: recipeId =>
        get$(`/api/processing-recipes/${recipeId}`),
}
