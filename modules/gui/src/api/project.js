// import {delete$, get$, postBinary$} from 'http-client'
import {of} from 'rxjs'

export default {
    loadAll$: () =>
        of([
            {id: 1, name: 'Foo'},
            {id: 2, name: 'Bar'},
            {id: 3, name: 'Baz'}
        ]),

    save$: ({id, name}) =>
        of(true),

    remove$: ({id}) =>
        of(true)

    // get$('/api/processing-projects'),

    // save$: ({id, type, name, gzippedContents}) =>
    //     postBinary$(`/api/processing-recipes/${id}`, {
    //         query: {type, name},
    //         body: gzippedContents
    //     }),

    // delete$: recipeId =>
    //     delete$(`/api/processing-recipes/${recipeId}`),

    // load$: recipeId =>
    //     get$(`/api/processing-recipes/${recipeId}`),
}
