import {inDateRange, RecipeActions, RecipeState, SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {objectEquals} from 'collections'
import React from 'react'
import {connect} from 'store'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        sceneAreas: recipe('ui.sceneAreas'),
        dates: recipe('dates'),
        sources: recipe('sources'),
        sceneSelectionOptions: recipe('sceneSelectionOptions'),
        scenes: recipe('scenes')
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
        if (!scenes)
            return
        if (sceneSelectionOptions.type !== SceneSelectionType.SELECT)
            this.recipe.setSelectedScenes({}).dispatch()
        const filteredScenes = {}
        const filterScenes = (scenes) => {
            if (!scenes)
                return []
            return scenes
                .filter(scene => inDateRange(scene.date, dates))
                .filter(scene => Object.values(sources).includes(scene.dataSet))
        }

        sceneAreas.forEach(sceneAreaId =>
            filteredScenes[sceneAreaId] = filterScenes(scenes[sceneAreaId])
        )
        this.recipe.setSelectedScenes(filteredScenes).dispatch()
    }
}

export default connect(mapStateToProps)(SceneDeselection)