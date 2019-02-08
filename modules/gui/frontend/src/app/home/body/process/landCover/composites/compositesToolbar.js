import CompositeOptions from 'app/home/body/process/landCover/compositeOptions'
import {withRecipePath} from 'app/home/body/process/recipe'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import Toolbar, {PanelButton} from 'widget/toolbar'
import styles from './compositesToolbar.module.css'

class CompositesToolbar extends React.Component {
    render() {
        const {recipeId, recipePath} = this.props
        const statePath = recipePath + '.ui'
        return (
            <PanelWizard
                panels={['areaOfInterest', 'period', 'typology']}
                statePath={statePath}>

                <Toolbar
                    statePath={statePath}
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <PanelButton
                        name='compositeOptions'
                        label={msg('process.landCover.panel.compositeOptions.button')}
                        tooltip={msg('process.landCover.panel.compositeOptions.tooltip')}>
                        <CompositeOptions recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

CompositesToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipePath()(
    CompositesToolbar
)
