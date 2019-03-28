import {connect} from 'store'
import {defaultModel} from './classificationRecipe'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {sepalMap} from 'app/home/map/map'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import ClassificationPreview from './classificationPreview'
import ClassificationToolbar from './classificationToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = state => ({
    tabCount: state.process.tabs.length
})

const mapRecipeToProps = recipe => ({
    recipeId: selectFrom(recipe, 'id'),
    initialized: selectFrom(recipe, 'ui.initialized'),
    source: selectFrom(recipe, 'model.source')
})

class Classification extends React.Component {
    render() {
        const {recipeId, recipePath, initialized} = this.props
        return (
            <React.Fragment>
                <MapToolbar
                    statePath={recipePath + '.ui'}
                    mapContext={recipeId}
                    labelLayerIndex={2}/>
                <ClassificationToolbar/>

                {initialized
                    ? <ClassificationPreview/>
                    : null}
            </React.Fragment>
        )
    }

    componentDidMount() {
        this.setAoiLayer()
    }

    componentDidUpdate() {
        this.setAoiLayer()
    }

    setAoiLayer() {
        const {recipeId, source, componentWillUnmount$} = this.props
        setRecipeGeometryLayer({
            contextId: recipeId,
            layerSpec: {id: 'aoi', layerIndex: 0, recipe: source},
            destroy$: componentWillUnmount$,
            onInitialized: () => {
                if (this.props.tabCount === 1) {
                    sepalMap.setContext(recipeId)
                    sepalMap.getContext(recipeId).fitLayer('aoi')
                }
            }
        })
    }
}

Classification.propTypes = {
    recipeId: PropTypes.string
}

export default (
    recipe({defaultModel, mapRecipeToProps})(
        connect(mapStateToProps)(
            Classification
        )
    )
)
