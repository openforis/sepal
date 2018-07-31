import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {PanelWizard} from 'widget/panel'
import {PanelButton, Toolbar, ToolbarButton} from 'widget/toolbar'
import {createComposites, recipePath, RecipeState} from './landCoverRecipe'
import styles from './landCoverToolbar.module.css'
import Aoi from '../mosaic/panels/aoi/aoi'
import Period from './period'
import Topology from './topology'


const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        recipe: recipeState()
    }
}

class LandCoverToolbar extends React.Component {
    render() {
        const {recipeId, initialized, recipe} = this.props
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
                        icon='cloud-download-alt'
                        tooltip='process.landCover.panel.createComposites'
                        disabled={!initialized}
                        onClick={() => createComposites(recipe)}/>
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
                </Toolbar>
            </PanelWizard>
        )
    }
}

LandCoverToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(LandCoverToolbar)