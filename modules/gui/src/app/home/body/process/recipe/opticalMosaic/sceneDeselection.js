import React from 'react'

import {inDateRange, RecipeActions, SceneSelectionType} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {isPartiallyEqual} from '~/hash'
import {selectFrom} from '~/stateUtils'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        sceneAreas: selectFrom(recipe, 'ui.sceneAreas'),
        dates: selectFrom(recipe, 'model.dates'),
        sources: selectFrom(recipe, 'model.sources'),
        sceneSelectionOptions: selectFrom(recipe, 'model.sceneSelectionOptions'),
        scenes: selectFrom(recipe, 'model.scenes')
    }
}

class _SceneDeselection extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        if (!isPartiallyEqual(prevProps, this.props, ['sceneAreas', 'dates', 'sources', 'sceneSelectionOptions']))
            this.updateSelectedScenes()
    }

    updateSelectedScenes() {
        const {sceneAreas, dates, sources, sceneSelectionOptions, scenes} = this.props
        if (!scenes) // No scenes selected, nothing to do
            return
        if (sceneSelectionOptions.type !== SceneSelectionType.SELECT)
            return this.recipeActions.setSelectedScenes(null).dispatch() // Not selecting individual scenes, remove all selected
        if (!sceneAreas) // Scene areas are not loaded, we don't know enough to filter out scenes
            return
        const filteredScenes = {}
        const filterScenes = scenes => {
            if (!scenes)
                return []
            return scenes
                .filter(scene => inDateRange(scene.date, dates))
                .filter(scene =>
                    !!Object.values(sources.dataSets).find(values => values.includes(scene.dataSet))
                )
        }
        sceneAreas
            .map(sceneArea => sceneArea.id)
            .forEach(sceneAreaId =>
                filteredScenes[sceneAreaId] = filterScenes(scenes[sceneAreaId])
            )
        this.recipeActions.setSelectedScenes(filteredScenes).dispatch()
    }
}

export const SceneDeselection = compose(
    _SceneDeselection,
    withRecipe(mapRecipeToProps)
)
