import _ from 'lodash'
import React from 'react'

import {withContext} from '~/context'

import {RecipeActions} from './classificationRecipe'

const Context = React.createContext()

export const DataCollectionManagerContext = ({dataCollectionManager, children}) =>
    <Context.Provider value={dataCollectionManager}>
        {children}
    </Context.Provider>

export const withDataCollectionManager = withContext(Context, 'dataCollectionManager')

export class DataCollectionManager {
    constructor(recipeId) {
        this.recipeActions = RecipeActions(recipeId)
        this.listeners = []
    }

    select(point, prevPoint) {
        if (!isClassified(point)) {
            return
        }
        if (prevPoint) {
            if (isClassified(prevPoint)) {
                this.deselect(prevPoint)
            } else {
                this.remove(prevPoint)
            }
        }
        this.recipeActions.setSelectedPoint(point)
        this.listeners.forEach(({onSelect}) => onSelect && onSelect(point))
    }

    deselect(point) {
        this.recipeActions.setSelectedPoint(null)
        this.listeners.forEach(({onDeselect}) => onDeselect && onDeselect(point))
    }

    add(point, prevPoint) {
        if (prevPoint) {
            this.deselect(prevPoint)
        }
        if (isClassified(point)) {
            this.recipeActions.addSelectedPoint(point)
        } else {
            this.recipeActions.setSelectedPoint(point)
        }
        this.listeners.forEach(({onAdd}) => onAdd && onAdd(point))
    }

    update(point, prevValue) {
        this.recipeActions.updateSelectedPoint(point)
        this.listeners.forEach(({onUpdate}) => onUpdate && onUpdate(point, prevValue))
    }

    remove(point) {
        this.recipeActions.removeSelectedPoint(point)
        this.listeners.forEach(({onRemove}) => onRemove && onRemove(point))
    }

    updateAll() {
        this.listeners.forEach(({onUpdateAll}) => onUpdateAll && onUpdateAll())
    }

    addListener({onSelect, onDeselect, onAdd, onUpdate, onRemove, onUpdateAll}) {
        this.listeners.push({onSelect, onDeselect, onAdd, onUpdate, onRemove, onUpdateAll})
    }
}

const isClassified = marker => Object.keys(marker).includes('class') && _.isFinite(marker['class'])
