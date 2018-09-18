import {RecipeState, recipePath} from './landCoverRecipe'
import {connect, select} from 'store'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import LandCoverToolbar from './landCoverToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import api from 'api'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        aoi: recipeState('model.aoi'),
        tabCount: select('process.tabs').length
    }
}

class LandCover extends React.Component {
    assessAccuracy() {
        this.props.asyncActionBuilder('ASSES_ACCURACY',
            api.tasks.submit$({
                operation: 'sepal.landcover.assess_land_cover_map_accuracy',
                params: {}
            })
        ).dispatch()
    }

    render() {
        const {recipeId} = this.props
        return (
            <React.Fragment>
                <MapToolbar
                    statePath={recipePath(recipeId, 'ui')}
                    mapContext={recipeId}
                    labelLayerIndex={1}/>
                <LandCoverToolbar recipeId={recipeId}/>
            </React.Fragment>
        )
    }

    // TODO: This is duplicated from mosaic. Will end up in classification too. Higher order component? AoiTab...
    componentDidMount() {
        const {recipeId, aoi, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi,
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

export default connect(mapStateToProps)(LandCover)
