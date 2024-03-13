import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {Dates} from './dates/dates'
import {Options} from './options/options'
import {PanelWizard} from '~/widget/panelWizard'
import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Toolbar} from '~/widget/toolbar/toolbar'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {setInitialized} from '../../../recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import React from 'react'
import styles from './baytsHistoricalToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _BaytsHistoricalToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'dates']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    panel
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.baytsHistorical.panel.dates.button')}
                        tooltip={msg('process.baytsHistorical.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.baytsHistorical.panel.options.button')}
                        tooltip={msg('process.baytsHistorical.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const BaytsHistoricalToolbar = compose(
    _BaytsHistoricalToolbar,
    withRecipe(mapRecipeToProps)
)
