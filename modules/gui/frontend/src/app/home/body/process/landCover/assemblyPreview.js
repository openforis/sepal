import {Button} from 'widget/button'
import {RecipeState, getPrimitiveTypes} from './landCoverRecipe'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {sepalMap} from 'app/home/map/map'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import Legend from './legend'
import MapStatus from 'widget/mapStatus'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import styles from 'app/home/body/process/classification/classificationPreview.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class AssemblyPreview extends React.Component {
    state = {}

    componentDidMount() {
        // RecipeActions(this.props.recipeId).setTypology({
        //     model:
        //         { // TODO: Create a panel for collecting this data
        //             primitiveTypes: [
        //                 {id: 'forest', label: 'Forest', value: 2, color: '007D34'},
        //                 {id: 'plantation', label: 'Plantation', value: 11, color: '93AA00'},
        //                 {id: 'shrub', label: 'Shrub', value: 12, color: '593315'},
        //                 {id: 'grass', label: 'Grass', value: 10, color: 'F4C800'},
        //                 {id: 'crop', label: 'Crop', value: 7, color: 'FF8E00'},
        //                 {id: 'paramo', label: 'Paramo', value: 9, color: 'CEA262'},
        //                 {id: 'water', label: 'Water', value: 8, color: '00538A'},
        //                 {id: 'urban', label: 'Urban', value: 6, color: '817066'},
        //                 {id: 'barren', label: 'Barren', value: 0, color: 'F6768E'}
        //             ]
        //         }
        // }).dispatch()

        this.updateLayer(this.toPreviewRequest(this.props.recipe))
    }

    componentDidUpdate(prevProps) {
        const {recipe} = this.props
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged)
            this.updateLayer(previewRequest)
        const context = sepalMap.getContext(recipe.id)
        context.hideLayer('preview', this.isHidden(recipe))
    }

    render() {
        const {recipe} = this.props
        const band = recipe.ui.preview.value
        if (this.isHidden())
            return null
        return (
            <React.Fragment>
                {band === 'classification'
                    ? <Legend recipeId={recipe.id}/>
                    : null}
                {this.renderMapStatus()}
            </React.Fragment>
        )

    }

    renderMapStatus() {
        const {initializing, tiles, error} = this.state
        if (error) {
            return (
                <MapStatus loading={false} error={error}/>
            )
        } else if (initializing)
            return (
                <MapStatus message={msg('process.classification.preview.initializing')}/>
            )
        else if (tiles && (!tiles.complete || tiles.failed))
            return (
                <MapStatus
                    loading={!tiles.complete}
                    message={msg('process.classification.preview.loading', {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg('process.classification.preview.tilesFailed', {failed: tiles.failed}) : error}/>
            )
        else
            return null
    }

    updateLayer(previewRequest) {
        const {recipeId, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            layerIndex: 0,
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            onProgress: tiles => this.onProgress(tiles)
        })
        const context = sepalMap.getContext(recipeId)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onError: e => this.onError(e)
        })
        if (changed && initializing !== !!layer)
            this.setState({initializing: !!layer, error: null})
        else if (changed && error)
            this.setState({error: null})
    }

    reload() {
        const {recipe} = this.props
        const context = sepalMap.getContext(recipe.id)
        context.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    isHidden() {
        const {recipe} = this.props
        return !!recipe.ui.selectedPanel
    }

    onProgress(tiles) {
        this.setState({tiles, initializing: false})
    }

    onError(e) {
        const message = e.response && e.response.code
            ? msg(e.response.code, e.response.data)
            : msg('process.classification.preview.error')
        this.setState({
            error:
                <div>
                    {message}
                    <div className={styles.retry}>
                        <Button
                            chromeless
                            look='transparent'
                            shape='pill'
                            icon='sync'
                            label={msg('button.retry')}
                            onClick={() => this.reload()}
                        />
                    </div>
                </div>
        })
    }

    toPreviewRequest(recipe) {
        const year = recipe.ui.preview.year
        const band = recipe.ui.preview.value
        const name = recipe.title || recipe.placeholder
        const vizParams = band === 'classification' ? this.classificationVizParams() : this.confidenceVizParams()
        return {
            recipe: {
                type: 'ASSET',
                path: `${name}/assembly/${year}`,
                vizParams
            }
        }
    }

    classificationVizParams() {
        const {recipe} = this.props
        const primitiveTypes = getPrimitiveTypes(recipe)
        return {
            bands: 'classification',
            min: 0,
            max: primitiveTypes.length - 1,
            palette: primitiveTypes.map(type => type.color)
        }
    }

    confidenceVizParams() {
        return {
            bands: 'confidence',
            min: 0,
            max: 100,
            palette: ['red', 'yellow', 'green']
        }
    }
}

AssemblyPreview.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default compose(
    AssemblyPreview,
    connect(mapStateToProps)
)
