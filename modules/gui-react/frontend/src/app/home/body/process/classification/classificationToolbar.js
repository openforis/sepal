import PropTypes from 'prop-types'
import React from 'react'
import {PanelWizard} from 'widget/panel'
import {PanelButton, Toolbar} from 'widget/toolbar'
import {recipePath} from './classificationRecipe'
import styles from './classificationToolbar.module.css'
import Source from './source'

export default class ClassificationToolbar extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <PanelWizard panels={['mosaic', 'trainingData']}>
                <Toolbar
                    statePath={recipePath(recipeId, 'ui')}
                    vertical bottom right
                    className={styles.bottom}>
                    <PanelButton
                        name='mosaic'
                        label='MOZ'
                        tooltip='Select mosaic to classify'>
                        <Source recipeId={recipeId}/>
                    </PanelButton>

                    <PanelButton
                        name='trainingData'
                        label='TRN'
                        tooltip='Select mosaic to classify'>
                        <Source recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

ClassificationToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}
