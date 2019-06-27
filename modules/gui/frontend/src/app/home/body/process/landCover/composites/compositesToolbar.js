import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withRecipePath} from 'app/home/body/process/recipe'
import CompositeOptions from 'app/home/body/process/landCover/compositeOptions'
import PanelWizard from 'widget/panelWizard'
import PropTypes from 'prop-types'
import React from 'react'
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
                    <Toolbar.PanelButton
                        name='compositeOptions'
                        label={msg('process.landCover.panel.compositeOptions.button')}
                        tooltip={msg('process.landCover.panel.compositeOptions.tooltip')}>
                        <CompositeOptions recipeId={recipeId}/>
                    </Toolbar.PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

CompositesToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default compose(
    CompositesToolbar,
    withRecipePath()
)
