import globalActionBuilder from 'action-builder'
import {recipePath, RecipeState} from '../recipe'

export {recipePath, RecipeState}

export const RecipeActions = (id) => {

    const actionBuilder = (name, props) => {
        return globalActionBuilder(name, props)
            .within(recipePath(id))
    }
    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()
    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setSource(sourceForm) {
            return setAll('SET_SOURCE', {
                'ui.source': {...sourceForm},
                'source': createSource(sourceForm),
            }, {sourceForm})
        },
    }
}

const createSource = (sourceForm) => {
    switch (sourceForm.section) {
        case 'recipe':
            return {
                type: 'recipe',
                id: sourceForm.recipe
            }
        case 'asset':
            return {
                type: 'asset',
                id: sourceForm.asset
            }
        default:
            throw new Error('Invalid source section: ' + sourceForm.section)
    }
}