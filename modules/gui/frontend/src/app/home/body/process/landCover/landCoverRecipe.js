import {RecipeState as GlobalRecipeState, recipePath} from '../recipe'
import {msg} from 'translate'
import _ from 'lodash'
import api from 'api'
import globalActionBuilder from 'action-builder'
import moment from 'moment'

export {recipePath}
export const RecipeState = recipeId => {
    const recipeState = GlobalRecipeState(recipeId)
    initRecipe(recipeState())
    return recipeState
}

export const RecipeActions = id => {
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
        setPeriod({values, model}) {
            return setAll('SET_PERIOD', {
                'ui.period': values,
                'model.period': model,
            }, {values, model})
        },
        setTypology({values, model}) {
            return setAll('SET_TYPOLOGY', {
                'ui.typology': values,
                'model.typology': model,
            }, {values, model})
        },
        setTrainingData({values, model}) {
            return setAll('SET_TRAINING_DATA', {
                'ui.trainingData': values,
                'model.trainingData': model,
            }, {values, model})
        },
        setCompositeOptions({values, model}) {
            return setAll('SET_COMPOSITE_OPTIONS', {
                'ui.compositeOptions': values,
                'model.compositeOptions': model,
            }, {values, model})
        },
        setFusionTableColumns(columns) {
            return set('SET_FUSION_TABLE_COLUMNS', 'ui.fusionTable.columns', columns, {columns})
        },
        setPreviewType(type, value) {
            return setAll('SET_PREVIEW_TYPE', {
                'ui.preview.type': type,
                'ui.preview.value': value,
            }, {previewType: type, value})
        },
        setPreviewYear(previewYear) {
            return setAll('SET_PREVIEW_YEAR', {
                'ui.preview.year': previewYear
            }, {previewYear})
        },
        setCompositeTaskId(taskId) {
            return setAll('SET_COMPOSITE_TASK_ID', {
                'model.compositeTaskId': taskId
            }, {taskId})
        },
        setLandCoverMapTaskId(taskId) {
            return setAll('SET_LAND_COVER_MAP_TASK_ID', {
                'model.landCoverTaskId': taskId
            }, {taskId})
        },
        setStatus(status) {
            return setAll('SET_STATUS', {
                'model.status': status
            }, {status})
        },
        setInitialized(initialized) {
            return set('SET_INITIALIZED', 'ui.initialized', !!initialized, {initialized})
        },
        selectPanel(name) {
            return set('SELECT_PANEL', 'ui.selectedPanel', name, {name})
        }

    }
}

const initRecipe = recipe => {
    if (!recipe || recipe.ui)
        return

    const actions = RecipeActions(recipe.id)

    const model = recipe.model
    if (model) {
        actions.setInitialized(model.aoi && model.period && model.typology).dispatch()
        actions.setStatus(Status.COMPOSITES_PENDING_CREATION).dispatch()
        return
    }

    const now = moment()
    let endYear = now.year()
    actions.setPeriod({
        model: {
            startYear: 2000,
            endYear: endYear
        }
    }).dispatch()

    actions.setTypology({
        model:
            { // TODO: Create a panel for collecting this data
                primitiveTypes: [
                    {id: 'forest', label: 'Forest', value: 2, color: '007D34'},
                    {id: 'plantation', label: 'Plantation', value: 11, color: '93AA00'},
                    {id: 'shrub', label: 'Shrub', value: 12, color: '593315'},
                    {id: 'grass', label: 'Grass', value: 10, color: 'F4C800'},
                    {id: 'crop', label: 'Crop', value: 7, color: 'FF8E00'},
                    {id: 'paramo', label: 'Paramo', value: 9, color: 'CEA262'},
                    {id: 'water', label: 'Water', value: 8, color: '00538A'},
                    {id: 'urban', label: 'Urban', value: 6, color: '817066'},
                    {id: 'barren', label: 'Barren', value: 0, color: 'F6768E'}
                ]
            }
    }).dispatch()

    actions.setTrainingData({
        model: {}
    }).dispatch()

    actions.setCompositeOptions({
        model: {
            cloudThreshold: 100,
            corrections: ['BRDF'],
            mask: ['CLOUDS', 'HAZE', 'SHADOW']
        }
    }).dispatch()

    actions.setStatus(Status.UNINITIALIZED).dispatch()
}

export const createComposites = recipe => {
    RecipeActions(recipe.id).setStatus(Status.CREATING_COMPOSITES).dispatch()
    const taskTitle = msg('process.landCover.panel.createComposites.task')
    api.tasks.submit$({
        operation: 'sepal.landcover.create_composites',
        params: {
            title: taskTitle,
            // assetPath: recipe.title || recipe.placeholder,
            // startYear: recipe.model.period.startYear,
            // endYear: recipe.model.period.endYear,
            // aoi: recipe.model.aoi,
            // sensors: ['L8', 'L7'], // TODO: Make sensors configurable
            // scale: 30
            //

            recipe: _.omit(recipe, ['ui'])
        }
    }).subscribe(task => RecipeActions(recipe.id).setCompositeTaskId(task.id).dispatch())
}

export const createLandCoverMap = recipe => {
    RecipeActions(recipe.id).setStatus(Status.CREATING_LAND_COVER_MAP).dispatch()
    const taskTitle = msg('process.landCover.panel.createLandCoverMap.task')
    api.tasks.submit$({
        operation: 'sepal.landcover.create_land_cover_map',
        params: {
            title: taskTitle,
            assetPath: recipe.title || recipe.placeholder,
            primitiveTypes: recipe.model.typology.primitiveTypes.map(primitiveType => primitiveType.id),
            // decisionTree: recipe.model.typology.decisionTree,
            decisionTree: tempDecisionTree,
            startYear: recipe.model.period.startYear,
            endYear: recipe.model.period.endYear,
            aoi: recipe.model.aoi,
            trainingData: recipe.model.trainingData,
            scale: 30,
        }
    }).subscribe(task => RecipeActions(recipe.id).setLandCoverMapTaskId(task.id).dispatch())
}

export const Status = {
    UNINITIALIZED: 'UNINITIALIZED',
    COMPOSITES_PENDING_CREATION: 'COMPOSITES_PENDING_CREATION',
    CREATING_COMPOSITES: 'CREATING_COMPOSITES',
    COMPOSITES_CREATED: 'COMPOSITES_CREATED',
    LAND_COVER_MAP_PENDING_CREATION: 'LAND_COVER_MAP_PENDING_CREATION',
    CREATING_LAND_COVER_MAP: 'CREATING_LAND_COVER_MAP',
    LAND_COVER_MAP_CREATED: 'LAND_COVER_MAP_CREATED',
}

const tempDecisionTree = {
    primitive: 'water',
    threshold: 80,
    true: 'water',
    false: {
        primitive: 'forest',
        threshold: 70,
        true: {
            primitive: 'plantation',
            threshold: 70,
            true: 'plantation',
            false: 'forest'
        },
        false: {
            primitive: 'crop',
            threshold: 65,
            true: 'crop',
            false: {
                primitive: 'urban',
                threshold: 80,
                true: 'urban',
                false: {
                    primitive: 'barren',
                    threshold: 70,
                    true: 'barren',
                    false: {
                        primitive: 'grass',
                        threshold: 70,
                        true: {
                            primitive: 'paramo',
                            threshold: 70,
                            true: 'paramo',
                            false: 'grass'
                        },
                        false: {
                            primitive: 'shrub',
                            threshold: 65,
                            true: 'shrub'
                        }
                    }
                }
            }
        }
    }
}

export const getPrimitiveTypes = (recipe) => {
    return [{id: 'other', label: 'Other', color: 'FFFFFF'}].concat(
        _.sortBy(recipe.model.typology.primitiveTypes, 'id')
    )
}
