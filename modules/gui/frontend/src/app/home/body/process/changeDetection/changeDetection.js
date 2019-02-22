import {defaultModel} from 'app/home/body/process/classification/classificationRecipe'
import {recipe} from 'app/home/body/process/recipeContext'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import {setRecipeGeometryLayer} from 'app/home/map/recipeGeometryLayer'
import {selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import ChangeDetectionPreview from './changeDetectionPreview'
import ChangeDetectionToolbar from './changeDetectionToolbar'

const mapStateToProps = state => ({
    tabCount: state.process.tabs.length
})

const mapRecipeToProps = recipe => ({
    recipeId: selectFrom(recipe, 'id'),
    initialized: selectFrom(recipe, 'ui.initialized'),
    source1: selectFrom(recipe, 'model.source1'),
    source2: selectFrom(recipe, 'model.source2'),
})

class ChangeDetection extends React.Component {
    render() {
        const {recipeId, recipePath, initialized} = this.props
        return (
            <React.Fragment>
                <MapToolbar
                    statePath={recipePath + '.ui'}
                    mapContext={recipeId}
                    labelLayerIndex={2}/>
                <ChangeDetectionToolbar/>

                {initialized
                    ? <ChangeDetectionPreview/>
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
        const {recipeId, source1, source2, componentWillUnmount$} = this.props
        setRecipeGeometryLayer({
            contextId: recipeId,
            layerSpec: {id: 'aoi', layerIndex: 0, recipe: source1 || source2},
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

ChangeDetection.propTypes = {
    recipeId: PropTypes.string
}

export default (
    recipe({defaultModel, mapRecipeToProps})(
        connect(mapStateToProps)(
            ChangeDetection
        )
    )
)
