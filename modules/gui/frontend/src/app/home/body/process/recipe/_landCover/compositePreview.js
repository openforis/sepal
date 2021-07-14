import {Button} from 'widget/button'
import {RecipeState} from 'app/home/body/process/recipe/classification/classificationRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {withMap} from 'app/home/map/mapContext'
import EarthEnginePreviewLayer from 'app/home/map/layer/earthEnginePreviewLayer'
import MapStatus from 'widget/mapStatus'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from 'app/home/body/process/classification/classificationPreview.module.css'
import withSubscriptions from 'subscription'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class CompositePreview extends React.Component {
    state = {}

    constructor(props) {
        super(props)
        this.progress$ = new Subject()
        const {addSubscription} = props
        addSubscription(
            this.progress$.subscribe(
                tiles => this.setState({tiles, initializing: false})
            )
        )
    }

    componentDidMount() {
        this.updateLayer(this.toPreviewRequest(this.props.recipe))
    }

    componentDidUpdate(prevProps) {
        const {recipe, map} = this.props
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged) {
            this.updateLayer(previewRequest)
        }
        map.hideLayer('preview', this.isHidden(recipe))
    }

    render() {
        const {initializing, tiles, error} = this.state
        if (this.isHidden())
            return null
        else if (error) {
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
                    message={msg('process.classification.preview.loading', {pending: tiles.loading})}
                    error={tiles.failed ? msg('process.classification.preview.tilesFailed', {failed: tiles.failed}) : error}/>
            )
        else
            return null
    }

    updateLayer(previewRequest) {
        const {map, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEnginePreviewLayer({
            map,
            layerIndex: 1,
            previewRequest,
            progress$: this.progress$
        })
        const changed = map.setLayer({
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
        const {recipe, map} = this.props
        map.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    isHidden() {
        const {recipe} = this.props
        return !!recipe.ui.selectedPanel
    }

    onError(e) {
        const message = e.response && e.response.messageKey
            ? msg(e.response.messageKey, e.response.messageArgs, e.response.defaultMessage)
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
        const bands = recipe.ui.preview.value
        const name = recipe.title || recipe.placeholder
        const vizParams = vizParamsByBands[bands]
        return {
            recipe: {
                type: 'ASSET',
                path: `${name}/composites/${year}`,
                vizParams
            }
        }
    }
}

const vizParamsByBands = {
    'red,green,blue': {
        bands: 'red,green,blue',
        min: '300, 100, 0',
        max: '2500, 2500, 2300',
        gamma: 1.2
    },
    'swir2,nir,red': {
        bands: 'swir2,nir,red',
        min: '100, 500, 300',
        max: '2000, 6000, 2500'
    }
}

CompositePreview.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default compose(
    CompositePreview,
    connect(mapStateToProps),
    withMap(),
    withSubscriptions()
)
