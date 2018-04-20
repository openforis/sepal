import actionBuilder from 'action-builder'
import {select} from 'store'

const recipePath = (id, path) => {
    const tabIndex = select('process.tabs')
        .findIndex((tab) => tab.id === id)
    if (tabIndex === -1)
        throw new Error(`Recipe not found: ${id}`)
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
    const _actionBuilder = (name, props) => {
        return actionBuilder(name, props)
            .within(recipePath(id))
    }
    const set = (name, prop, value, otherProps) => {
        _actionBuilder(name, otherProps)
            .set(prop, value)
            .dispatch()
    }
    return {
        setLabelsShown(shown) {
            set('SET_LABELS_SHOWN', 'labelsShown', shown, {shown})
        },
        setGridShown(shown) {
            set('SET_GRID_SHOWN', 'gridShown', shown, {shown})
        },
        selectPanel(panel) {
            set('SELECT_MOSAIC_PANEL', 'selectedPanel', panel, {panel})
        },
        setAoi(aoi) {
            set('SET_AOI', 'aoi', aoi, {aoi})
        },
        setModal(enabled) {
            set('SET_MODAL', 'modal', enabled, {enabled})
        }
    }
}
