import {Msg} from 'translate'
import {connect} from 'store'
import {sepalMap} from 'app/home/map/map'
import EarthEngineImageLayer from 'app/home/map/earthEngineLayer'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import styles from 'app/home/body/process/mosaic/mosaicPreview.module.css'
import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class ClassificationPreview extends React.Component {

    componentDidMount() {
        this.updateLayer()
    }

    componentDidUpdate(prevProps) {
        const {recipe} = this.props
        const layerChanged = !_.isEqual(recipe.model, prevProps.recipe.model)
        if (layerChanged)
            this.updateLayer()
        const context = sepalMap.getContext(recipe.id)
        context.hideLayer('preview', this.isHidden(recipe))
    }

    render() {
        return <div>Classification Preview</div>
    }

    updateLayer() {
        const {recipe, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineImageLayer({
            layerIndex: 0,
            bounds: recipe.model.aoi.bounds,
            mapId$: api.gee.preview$(_.omit(recipe, ['ui']), recipe.ui.bands.selection),
            props: recipe.model,
            onProgress: (tiles) => this.onProgress(tiles)
        })
        const context = sepalMap.getContext(recipe.id)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            // onError: () => this.onError()
        })
        if (changed && initializing !== !!layer)
            this.setState(prevState => ({...prevState, initializing: !!layer, error: null}))
        else if (changed && error)
            this.setState(prevState => ({...prevState, error: null}))
    }

    isHidden() {
        const {recipe} = this.props
        return !!recipe.ui.selectedPanel
    }

    onError() {
        this.setState(prevState => ({
            ...prevState,
            error:
                <div>
                    <Msg id='process.mosaic.preview.error'/>
                    <div className={styles.retry}>
                        <a
                            href=''
                            onClick={(e) => {
                                e.preventDefault()
                                this.reload()
                            }}>
                            <Icon name='sync'/>
                            <Msg id='button.retry'/>
                        </a>
                    </div>

                </div>
        }))
    }
}

ClassificationPreview.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(ClassificationPreview)
