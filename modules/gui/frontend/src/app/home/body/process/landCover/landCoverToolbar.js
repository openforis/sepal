import {PanelButton, Toolbar, ToolbarButton} from 'widget/toolbar'
import {RecipeActions, RecipeState, Status, createComposites, createLandCoverMap, recipePath} from './landCoverRecipe'
import {connect} from 'store'
import {msg} from 'translate'
import Aoi from '../mosaic/panels/aoi/aoi'
import CompositeOptions from './compositeOptions'
import PanelWizard from 'widget/panelWizard'
import Period from './period'
import PropTypes from 'prop-types'
import React from 'react'
import TrainingData from './trainingData'
import Typology from './typology'
import styles from './landCoverToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class LandCoverToolbar extends React.Component {
    render() {
        const {recipeId, recipe} = this.props
        const statePath = recipePath(recipeId, 'ui')
        const trainingData = recipe.model.trainingData || {}
        const status = recipe.model.status
        return (
            <PanelWizard
                panels={['areaOfInterest', 'period', 'typology']}
                statePath={statePath}>
                <Toolbar
                    statePath={statePath}
                    vertical top right
                    className={styles.top}>
                    <ToolbarButton
                        name='createComposites'
                        icon={status === Status.CREATING_COMPOSITES ? 'spinner' : 'cloud-download-alt'}
                        tooltip={msg('process.landCover.panel.createComposites.tooltip')}
                        disabled={[Status.UNINITIALIZED, Status.CREATING_COMPOSITES].includes(recipe.model.status)}
                        onClick={() => this.createComposites()}/>
                    <ToolbarButton
                        name='createPrimitives'
                        icon={status === Status.CREATING_LAND_COVER_MAP ? 'spinner' : 'cloud-download-alt'}
                        tooltip={msg('process.landCover.panel.createLandCoverMap.tooltip')}
                        disabled={![Status.LAND_COVER_MAP_PENDING_CREATION, Status.LAND_COVER_MAP_CREATED]
                            .includes(recipe.model.status) || !trainingData.classColumn}
                        onClick={() => this.createLandCoverMap()}/>
                </Toolbar>
                <Toolbar
                    statePath={statePath}
                    vertical bottom right
                    className={styles.bottom}>
                    <PanelButton
                        name='areaOfInterest'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}>
                        <Aoi recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='period'
                        label={msg('process.landCover.panel.period.button')}
                        tooltip={msg('process.landCover.panel.period.tooltip')}>
                        <Period recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='typology'
                        label={msg('process.landCover.panel.typology.button')}
                        tooltip={msg('process.landCover.panel.typology.tooltip')}>
                        <Typology recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='compositeOptions'
                        label={msg('process.landCover.panel.compositeOptions.button')}
                        tooltip={msg('process.landCover.panel.compositeOptions.tooltip')}>
                        <CompositeOptions recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='trainingData'
                        label={msg('process.landCover.panel.trainingData.button')}
                        tooltip={msg('process.landCover.panel.trainingData.tooltip')}>
                        <TrainingData recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }

    componentDidMount() {
        this.showMandatoryPanel()
    }

    componentDidUpdate() {
        this.showMandatoryPanel()
    }

    createComposites() {
        const {recipe} = this.props
        createComposites(recipe)
    }

    createLandCoverMap() {
        const {recipe} = this.props
        createLandCoverMap(recipe)
    }

    showMandatoryPanel() {
        const {recipe} = this.props
        const {tableId} = recipe.model.trainingData
        if (recipe.model.status === Status.COMPOSITES_CREATED && !tableId)
            RecipeActions(recipe.id).selectPanel('trainingData').dispatch()
    }
}

LandCoverToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(LandCoverToolbar)
