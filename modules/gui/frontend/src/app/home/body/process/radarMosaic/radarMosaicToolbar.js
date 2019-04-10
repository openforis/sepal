import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import {selectFrom} from 'stateUtils'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import Toolbar, {ActivationButton} from 'widget/toolbar'
import Aoi from '../mosaic/panels/aoi/aoi'
import {setInitialized} from '../recipe'
import Dates from './dates/dates'
import Options from './options/options'
import styles from './radarMosaicToolbar.module.css'
import Retrieve from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class RadarMosaicToolbar extends React.Component {
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

                    <ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.radarMosaic.panel.retrieve.tooltip')}
                        disabled={!initialized}
                    />
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}/>
                    <ActivationButton
                        id='dates'
                        label={msg('process.radarMosaic.panel.dates.button')}
                        tooltip={msg('process.radarMosaic.panel.dates.tooltip')}/>
                    <ActivationButton
                        id='options'
                        label={msg('process.radarMosaic.panel.options.button')}
                        tooltip={msg('process.radarMosaic.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export default withRecipe(mapRecipeToProps)(RadarMosaicToolbar)
