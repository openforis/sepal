import _ from 'lodash'
import React from 'react'

import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {Options as RadarOptions} from '~/app/home/body/process/recipe/mosaic/panels/radarMosaicOptions/options'
import {createCompositeOptions} from '~/app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions'
import {Options as PlanetOptions} from '~/app/home/body/process/recipe/planetMosaic/panels/options/options'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {setInitialized} from '../../../recipe'
import {RetrieveButton} from '../../retrieveButton'
import {Dates} from './dates/dates'
import styles from './phenologyToolbar.module.css'
import {Retrieve} from './retrieve/retrieve'
import {Sources} from './sources/sources'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    sources: selectFrom(recipe, 'model.sources'),
})

class _PhenologyToolbar extends React.Component {
    render() {
        const {recipeId, initialized, sources} = this.props
        const dataSets = Object.keys(sources.dataSets)
        return (
            <PanelWizard
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Sources/>
                {dataSets.includes('SENTINEL_1')
                    ? <RadarOptions/>
                    : dataSets.includes('PLANET')
                        ? <PlanetOptions
                            title={msg('process.timeSeries.panel.preprocess.title')}
                            source={sources.dataSets['PLANET'][0]}
                            forCollection
                        />
                        : <OpticalOptions
                            title={msg('process.timeSeries.panel.preprocess.title')}
                            forCollection
                        />
                }

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
                        label={msg('process.phenology.panel.dates.button')}
                        tooltip={msg('process.phenology.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.changeAlerts.panel.sources.button')}
                        tooltip={msg('process.changeAlerts.panel.sources.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.timeSeries.panel.preprocess.button')}
                        tooltip={msg('process.timeSeries.panel.preprocess.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

const OpticalOptions = createCompositeOptions({
    id: 'options'
})

export const PhenologyToolbar = compose(
    _PhenologyToolbar,
    withRecipe(mapRecipeToProps)
)
