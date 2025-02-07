import _ from 'lodash'
import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../samplingDesignRecipe'
import {Proportions} from './proportions/proportions'
import {Retrieve} from './retrieve/retrieve'
import {SampleAllocation} from './sampleAllocation/sampleAllocation'
import {SampleArrangement} from './sampleArrangement/sampleArrangement'
import styles from './samplingDesignToolbar.module.css'
import {Stratification} from './stratification/stratification'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _SamplingDesignToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['aoi', 'stratification']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <Aoi/>
                <Stratification/>
                <Proportions/>
                <SampleAllocation/>
                <SampleArrangement/>

                <Toolbar
                    vertical
                    placement='top-right'
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
                        id='stratification'
                        label={msg('process.samplingDesign.panel.stratification.button')}
                        tooltip={msg('process.samplingDesign.panel.stratification.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='proportions'
                        label={msg('process.samplingDesign.panel.proportions.button')}
                        tooltip={msg('process.samplingDesign.panel.proportions.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sampleAllocation'
                        label={msg('process.samplingDesign.panel.sampleAllocation.button')}
                        tooltip={msg('process.samplingDesign.panel.sampleAllocation.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sampleArrangement'
                        label={msg('process.samplingDesign.panel.sampleArrangement.button')}
                        tooltip={msg('process.samplingDesign.panel.sampleArrangement.tooltip')}
                        disabled={!initialized}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const SamplingDesignToolbar = compose(
    _SamplingDesignToolbar,
    withRecipe(mapRecipeToProps)
)

SamplingDesignToolbar.propTypes = {}
