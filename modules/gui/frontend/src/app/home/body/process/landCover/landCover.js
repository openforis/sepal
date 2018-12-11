import {RecipeState, recipePath, statuses} from './landCoverRecipe'
import {connect, select} from 'store'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import LandCoverToolbar from './landCoverToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import React from 'react'
import api from 'api'
import CompositePreview from "./compositePreview"
import CompositesMonitor from "./compositesMonitor"
import PreviewSelection from "./previewSelection";

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        status: recipeState('model.status'),
        preview: recipeState('ui.preview'),
        aoi: recipeState('model.aoi'),
        tabCount: select('process.tabs').length,
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

                {this.renderPreview()}
                {this.inPreviewableState()
                    ? <PreviewSelection recipeId={recipeId}/>
                    : null}
                <CompositesMonitor recipeId={recipeId}/>
            </React.Fragment>
        )
    }

    renderPreview() {
        const {recipeId, preview} = this.props
        if (!this.inPreviewableState() || !preview || !preview.type || !preview.value || !preview.year)
            return null
        switch (preview.type) {
            case 'composite':
                return <CompositePreview recipeId={recipeId}/>
            default:
                return null
        }
    }

    inPreviewableState() {
        const {status} = this.props
        // return ![statuses.UNINITIALIZED, statuses.COMPOSITES_PENDING_CREATION, statuses.CREATING_COMPOSITES].includes(status)
        return true
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
