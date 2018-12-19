import {RecipeState, Status, recipePath} from './landCoverRecipe'
import {connect, select} from 'store'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import AssemblyPreview from './assemblyPreview'
import CompositePreview from './compositePreview'
import CompositesMonitor from './compositesMonitor'
import LandCoverToolbar from './landCoverToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import PreviewSelection from './previewSelection'
import PrimitivePreview from './primitivePreview'
import React from 'react'
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
        case 'primitive':
            return <PrimitivePreview recipeId={recipeId}/>
        case 'assembly':
            return <AssemblyPreview recipeId={recipeId}/>
        default:
            return null
        }
    }

    inPreviewableState() {
        const {status} = this.props
        return ![Status.UNINITIALIZED, Status.COMPOSITES_PENDING_CREATION, Status.CREATING_COMPOSITES].includes(status)
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
