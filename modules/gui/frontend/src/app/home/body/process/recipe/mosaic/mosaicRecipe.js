import {recipeActionBuilder, recipePath} from '../../recipe'
import LabelsLayer from '../../../../map/labelsLayer'
import _ from 'lodash'

export const SceneSelectionType = Object.freeze({
    ALL: 'ALL',
    SELECT: 'SELECT'
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()

    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setLabelsShown(map, shown) {
            // return LabelsLayer.showLabelsAction({map, shown, statePath: recipePath(id, 'ui'), layerIndex: 3})
        },
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
        setEETableColumns(columns) {
            return set('SET_EE_TABLE_COLUMNS', 'ui.eeTable.columns', columns, {columns})
        },
        setEETableRows(rows) {
            return set('SET_EE_TABLE_ROWS', 'ui.eeTable.rows', rows, {rows})
        },
    }
}
