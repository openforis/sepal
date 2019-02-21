import {defaultModel, getSource, RecipeActions, SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import ShowSceneAreaToggle from 'app/home/body/process/mosaic/showSceneAreaToggle'
import {recipe} from 'app/home/body/process/recipeContext'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import {selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {Content, SectionLayout} from 'widget/sectionLayout'
import AutoSelectScenes from './autoSelectScenes'
import BandSelection from './bandSelection'
import styles from './mosaic.module.css'
import MosaicPreview from './mosaicPreview'
import MosaicToolbar from './panels/mosaicToolbar'
import SceneAreas from './sceneAreas'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'

const mapStateToProps = state => ({
    tabCount: state.process.tabs.length
})

const mapRecipeToProps = recipe => ({
    recipeId: selectFrom(recipe, 'id'),
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    dates: selectFrom(recipe, 'model.dates'),
    source: getSource(recipe),
    sceneSelectionOptions: selectFrom(recipe, 'model.sceneSelectionOptions')
})

class Mosaic extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, aoi, componentWillUnmount$} = props
        const actions = RecipeActions(recipeId)
        actions.setLabelsShown(false).dispatch()
        actions.setSceneAreasShown(true).dispatch()
        actions.setBands('red, green, blue').dispatch()
        actions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()
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

    render() {
        const {recipeId, recipeContext: {statePath}, initialized, aoi, source, sceneSelectionOptions: {type}} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={styles.mosaic}>
                        <MapToolbar statePath={statePath + '.ui'} mapContext={recipeId} labelLayerIndex={1}>
                            <ShowSceneAreaToggle/>
                        </MapToolbar>
                        <MosaicToolbar/>

                        {initialized
                            ? <React.Fragment>
                                <MosaicPreview/>
                                {aoi && source && type === SceneSelectionType.SELECT
                                    ? <React.Fragment>
                                        <SceneAreas/>
                                        <AutoSelectScenes/>
                                    </React.Fragment>
                                    : null}
                                <SceneSelection/>
                                <SceneDeselection/>
                                <BandSelection/>
                            </React.Fragment>
                            : null}
                    </div>
                </Content>
            </SectionLayout>
        )
    }
}

Mosaic.propTypes = {
    aoi: PropTypes.object
}

export default (
    recipe({defaultModel, mapRecipeToProps})(
        connect(mapStateToProps)(
            Mosaic
        )
    )
)
