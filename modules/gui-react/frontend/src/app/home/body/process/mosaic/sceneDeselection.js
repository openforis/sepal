import {inDateRange, RecipeActions, RecipeState, SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {objectEquals} from 'collections'
import React from 'react'
import {connect} from 'store'


const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        sceneAreas: recipeState('ui.sceneAreas'),
        dates: recipeState('dates'),
        sources: recipeState('sources'),
        sceneSelectionOptions: recipeState('sceneSelectionOptions'),
        scenes: recipeState('scenes')
    }
}

class SceneDeselection extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        if (!objectEquals(prevProps, this.props, ['sceneAreas', 'dates', 'sources', 'sceneSelectionOptions']))
            this.updateSelectedScenes()
    }

    updateSelectedScenes() {
        const {sceneAreas, dates, sources, sceneSelectionOptions, scenes} = this.props
        if (!scenes) // No scenes selected, nothing to do
            return
        if (sceneSelectionOptions.type !== SceneSelectionType.SELECT)
            return this.recipe.setSelectedScenes(null).dispatch() // Not selecting individual scenes, remove all selected
        if (!sceneAreas) // Scene areas are not loaded, we don't know enough to filter out scenes
            return
        const filteredScenes = {}
        const filterScenes = (scenes) => {
            if (!scenes)
                return []
            return scenes
                .filter(scene => inDateRange(scene.date, dates))
                .filter(scene =>
                    !!Object.values(sources).find(values => values.includes(scene.dataSet))
                )
        }
        sceneAreas
            .map(sceneArea => sceneArea.id)
            .forEach(sceneAreaId =>
                filteredScenes[sceneAreaId] = filterScenes(scenes[sceneAreaId])
            )
        this.recipe.setSelectedScenes(filteredScenes).dispatch()
    }
}

export default connect(mapStateToProps)(SceneDeselection)