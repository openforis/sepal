import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {Dates} from './dates/dates'
import {Options} from './options/options'
import {PanelWizard} from '~/widget/panelWizard'
import {Retrieve} from './retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {Sources} from './sources/sources'
import {Toolbar} from '~/widget/toolbar/toolbar'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import React from 'react'
import styles from './planetMosaicToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _PlanetMosaicToolbar extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Sources/>
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
                        label={msg('process.planetMosaic.panel.dates.button')}
                        tooltip={msg('process.planetMosaic.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.planetMosaic.panel.sources.button')}
                        tooltip={msg('process.planetMosaic.panel.sources.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.planetMosaic.panel.options.button')}
                        tooltip={msg('process.planetMosaic.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const PlanetMosaicToolbar = compose(
    _PlanetMosaicToolbar,
    withRecipe(mapRecipeToProps)
)
