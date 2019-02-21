import {recipe} from 'app/home/body/process/recipeContext'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import {selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import ClassificationPreview from './classificationPreview'
import {defaultModel} from './classificationRecipe'
import ClassificationToolbar from './classificationToolbar'

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
