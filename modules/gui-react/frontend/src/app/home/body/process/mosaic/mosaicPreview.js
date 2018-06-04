import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import EarthEngineImageLayer from 'app/home/map/earthEngineLayer'
import {sepalMap} from 'app/home/map/map'
import backend from 'backend'
import _ from 'lodash'
import React from 'react'
import {connect} from 'store'
import {Msg} from 'translate'
import Icon from 'widget/icon'
import styles from './mosaicPreview.module.css'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        recipe: recipe()
    }
}

class MosaicPreview extends React.Component {
    state = {}

    render() {
        const {initializing, tiles} = this.state
        const {recipe} = this.props
        if (this.isHidden(recipe))
            return null
        const status = (content) =>
            <div className={styles.container}>
                <div className={styles.status}>
                    {!tiles || tiles.loading ? <Icon name='spinner'/> : null}
                    {content}
                </div>
            </div>

        if (initializing)
            return status(
                <div><Msg id='process.mosaic.preview.initializing'/></div>
            )
        else if (tiles && !tiles.complete)
            return status(
                <div>
                    <div className={styles.loaded}>
                        <Msg id='process.mosaic.preview.loading' loaded={tiles.loaded} count={tiles.count}/>
                    </div>
                    {tiles.failed
                        ? (
                            <div className={styles.failed}>
                                (<Msg id='process.mosaic.preview.failed' failed={tiles.failed}/>)
                            </div>
                        )
                        : null
                    }
                </div>
            )
        else
            return null
    }

    onProgress(tiles) {
        this.setState(prevState => ({...prevState, tiles, initializing: false}))
    }

    componentDidUpdate() {
        const {recipeId, recipe, componentWillUnmount$} = this.props
        const {initializing} = this.state
        const layer = recipe.ui.initialized ? new EarthEngineImageLayer({
            bounds: recipe.aoi.bounds,
            mapId$: backend.gee.preview$(recipe),
            props: _.omit(recipe, 'ui'),
            onProgress: (tiles) => this.onProgress(tiles)
        }) : null
        const context = sepalMap.getContext(recipeId)
        const changed = context.setLayer({id: 'preview', layer, destroy$: componentWillUnmount$})
        context.hideLayer('preview', this.isHidden(recipe))
        if (changed && initializing !== !!layer)
            this.setState(prevState => ({...prevState, initializing: !!layer}))

    }

    isHidden(recipe) {
        return !recipe || !recipe.ui || !!recipe.ui.selectedPanel
    }
}

export default connect(mapStateToProps)(MosaicPreview)
