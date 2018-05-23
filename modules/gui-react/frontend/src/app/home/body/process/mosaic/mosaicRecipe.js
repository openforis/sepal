import actionBuilder from 'action-builder'
import {select} from 'store'
import {map} from '../../../map/map'

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
    const set = (name, prop, value, otherProps) =>
        _actionBuilder(name, otherProps)
            .set(prop, value)
            .build()

    return {
        setInitialized() {
            return set('SET_INITIALIZED', 'initialized', true)
        },
        setLabelsShown(shown) {
            map.showLabelsLayer(shown)
            return set('SET_LABELS_SHOWN', 'ui.labelsShown', shown, {shown})
        },
        setGridShown(shown) {
            return set('SET_GRID_SHOWN', 'ui.gridShown', shown, {shown})
        },
        selectPanel(panel) {
            return set('SELECT_MOSAIC_PANEL', 'ui.selectedPanel', panel, {panel})
        },
        setAoi(aoi) {
            return set('SET_AOI', 'aoi', {...aoi}, {aoi})
        },
        setDates(dates) {
            return set('SET_DATES', 'dates', {...dates}, {dates})
        },
        setSources(sources) {
            return set('SET_SOURCES', 'sources', {...sources}, {sources})
        },
        setModal(enabled) {
            return set('SET_MODAL', 'ui.modal', enabled, {enabled})
        },
        setBounds(bounds) {
            return set('SET_BOUNDS', 'ui.bounds', bounds, {bounds})
        },
        setFusionTableColumns(columns) {
            return set('SET_FUSION_TABLE_COLUMNS', 'ui.fusionTable.columns', columns, {columns})
        },
        setFusionTableRows(rows) {
            return set('SET_FUSION_TABLE_ROWS', 'ui.fusionTable.rows', rows, {rows})
        }
    }
}
