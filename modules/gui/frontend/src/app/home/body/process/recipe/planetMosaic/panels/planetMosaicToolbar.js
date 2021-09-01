import {Retrieve} from './retrieve/retrieve'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from '../../../recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Aoi from 'app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import Dates from './dates/dates'
import Options from './options/options'
import PanelWizard from 'widget/panelWizard'
import React from 'react'
import styles from './planetMosaicToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class PlanetMosaicToolbar extends React.Component {
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

                    <Toolbar.ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.retrieve.tooltip')}
                        disabled={!initialized}
                    />
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.planetMosaic.panel.dates.button')}
                        tooltip={msg('process.planetMosaic.panel.dates.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.planetMosaic.panel.options.button')}
                        tooltip={msg('process.planetMosaic.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export default compose(
    PlanetMosaicToolbar,
    withRecipe(mapRecipeToProps)
)
