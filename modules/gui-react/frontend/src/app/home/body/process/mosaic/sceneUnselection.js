import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {objectEquals} from 'collections'
import React from 'react'
import {connect} from 'store'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        aoi: recipe('aoi'),
        dates: recipe('dates'),
        sources: recipe('sources'),
        sceneSelectionOptions: recipe('sceneSelectionOptions')
    }
}

class SceneUnselection extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        return null
    }

    componentDidUpdate(prevProps) {
        if (!objectEquals(prevProps, this.props, ['aoi', 'dates', 'sources', 'sceneSelectionOptions']))
            this.updateSelectedScenes()
    }

    updateSelectedScenes() {
        const {aoi, dates, sources, sceneSelectionOptions} = this.props
        // TODO: Need to know the scene areas, not the AOI, to determine if a scene should be removed due to change in AOI
    }
}

export default connect(mapStateToProps)(SceneUnselection)