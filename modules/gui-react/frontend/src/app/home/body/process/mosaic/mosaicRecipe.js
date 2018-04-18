import actionBuilder from 'action-builder'
import {select} from 'store'

const recipePath = (id, path) => {
    const tabIndex = select('process.tabs')
        .findIndex((tab) => tab.id === id)
    return ['process.tabs', tabIndex, path]
        .filter(e => e !== undefined)
        .join('.')
}

export const RecipeState = (id) => {
    return (path) => {
        return select(recipePath(id, path))
    } 
}

export const RecipeActions = (id) => {
    const _actionBuilder = (name) => {
        return actionBuilder(name)
            .within(recipePath(id))
    }
    const set = (name, prop, value) => {
        _actionBuilder(name)
            .set(prop, value)
            .dispatch()
    }
    return {
        setLabelsShown(shown) {
            set('SET_LABELS_SHOWN', 'labelsShown', shown)
        },
        setGridShown(shown) {
            set('SET_GRID_SHOWN', 'gridShown', shown)
        },
        selectPanel(panel) {
            set('SELECT_MOSAIC_PANEL', 'selectedPanel', panel)
        }
    }
}
