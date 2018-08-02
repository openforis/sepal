import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {PanelWizard} from 'widget/panel'
import {PanelButton, Toolbar, ToolbarButton} from 'widget/toolbar'
import {createComposites, createLandCoverMap, recipePath, RecipeState} from './landCoverRecipe'
import styles from './landCoverToolbar.module.css'
import Aoi from '../mosaic/panels/aoi/aoi'
import Period from './period'
import Topology from './topology'
import CompositeOptions from './compositeOptions'
import TrainingData from './trainingData'


const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        recipe: recipeState()
    }
}

class LandCoverToolbar extends React.Component {
    state = {}

    render() {
        const {recipeId, initialized} = this.props
        const {creatingComposites, creatingPrimitives} = this.state
        const statePath = recipePath(recipeId, 'ui')
        return (
            <PanelWizard
                panels={['areaOfInterest', 'period', 'topology']}
                statePath={statePath}>
                <Toolbar
                    statePath={statePath}
                    vertical top right
                    className={styles.top}>
                    <ToolbarButton
                        name='createComposites'
                        icon={creatingComposites ? 'spinner' : 'cloud-download-alt'}
                        tooltip='process.landCover.panel.createComposites'
                        disabled={!initialized || creatingComposites}
                        onClick={() => this.createComposites()}/>
                    <ToolbarButton
                        name='createPrimitives'
                        icon={creatingPrimitives ? 'spinner' : 'cloud-download-alt'}
                        tooltip='process.landCover.panel.createPrimitives'
                        disabled={!creatingComposites}
                        onClick={() => this.createLandCoverMap()}/>
                </Toolbar>
                <Toolbar
                    statePath={statePath}
                    vertical bottom right
                    className={styles.bottom}>
                    <PanelButton
                        name='areaOfInterest'
                        label='process.mosaic.panel.areaOfInterest.button'
                        tooltip='process.mosaic.panel.areaOfInterest'>
                        <Aoi recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='period'
                        label='process.landCover.panel.period.button'
                        tooltip='process.landCover.panel.period'>
                        <Period recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='topology'
                        label='process.landCover.panel.topology.button'
                        tooltip='process.landCover.panel.topology'>
                        <Topology recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='compositeOptions'
                        label='process.landCover.panel.compositeOptions.button'
                        tooltip='process.landCover.panel.compositeOptions'>
                        <CompositeOptions recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='trainingData'
                        label='process.landCover.panel.trainingData.button'
                        tooltip='process.landCover.panel.trainingData'>
                        <TrainingData recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }

    createComposites() {
        const {recipe} = this.props
        createComposites(recipe)
        this.setState(prevState => ({...prevState, creatingComposites: true}))
    }

    createLandCoverMap() {
        const {recipe} = this.props
        createLandCoverMap(recipe)
        this.setState(prevState => ({...prevState, creatingPrimitives: true}))
    }
}

LandCoverToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(LandCoverToolbar)