import _ from 'lodash'
import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {Aoi} from '~/app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {retrieveButtonState} from '../sampling/retrieveButtonState'
import {isSectionStale} from '../sampling/validateRetrieve'
import {RecipeActions} from '../samplingDesignRecipe'
import {Proportions} from './proportions/proportions'
import {Retrieve} from './retrieve/retrieve'
import {SampleAllocation} from './sampleAllocation/sampleAllocation'
import {SampleArrangement} from './sampleArrangement/sampleArrangement'
import styles from './samplingDesignToolbar.module.css'
import {Stratification} from './stratification/stratification'

const mapStateToProps = state => ({
    googleAccount: !!selectFrom(state, 'user.currentUser.googleTokens'),
    assetRoots: selectFrom(state, 'assets.roots')
})

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    model: recipe.model,
    initialized: selectFrom(recipe, 'ui.initialized'),
    // Applicability-filtered, exactly as Retrieve reads them: a skipped section computes nothing, so a flag
    // an old recipe still carries for one must not light its button either.
    stratificationRequiresUpdate: isSectionStale(recipe.model, 'stratification'),
    proportionsRequiresUpdate: isSectionStale(recipe.model, 'proportions'),
    sampleAllocationRequiresUpdate: isSectionStale(recipe.model, 'sampleAllocation'),
    sampleArrangementRequiresUpdate: isSectionStale(recipe.model, 'sampleArrangement')
})

const retrieveTooltip = ({kind, code, args}) => {
    if (kind === 'model') {
        return `${msg('process.samplingDesign.retrieve.invalid')} ${msg(`process.samplingDesign.retrieve.invalid.${code}`, args)}`
    }
    if (kind === 'capability') {
        return msg(`process.samplingDesign.retrieve.capability.${code}`)
    }
    return undefined
}

class _SamplingDesignToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, model, areaCache, probabilityCache, googleAccount, assetRoots, initialized, stratificationRequiresUpdate, proportionsRequiresUpdate, sampleAllocationRequiresUpdate, sampleArrangementRequiresUpdate} = this.props
        const buttonState = retrieveButtonState({model, googleAccount, assetRoots})
        return (
            <PanelWizard
                panels={['aoi', 'stratification']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <Aoi/>
                <Stratification areaCache={areaCache}/>
                <Proportions probabilityCache={probabilityCache}/>
                <SampleAllocation/>
                <SampleArrangement/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <RetrieveButton disabled={buttonState.disabled} tooltip={retrieveTooltip(buttonState)}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='stratification'
                        error={stratificationRequiresUpdate}
                        label={msg('process.samplingDesign.panel.stratification.button')}
                        tooltip={msg('process.samplingDesign.panel.stratification.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='proportions'
                        error={proportionsRequiresUpdate}
                        label={msg('process.samplingDesign.panel.proportions.button')}
                        tooltip={msg('process.samplingDesign.panel.proportions.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='sampleAllocation'
                        error={sampleAllocationRequiresUpdate}
                        label={msg('process.samplingDesign.panel.sampleAllocation.button')}
                        tooltip={msg('process.samplingDesign.panel.sampleAllocation.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='sampleArrangement'
                        error={sampleArrangementRequiresUpdate}
                        label={msg('process.samplingDesign.panel.sampleArrangement.button')}
                        tooltip={msg('process.samplingDesign.panel.sampleArrangement.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const SamplingDesignToolbar = compose(
    _SamplingDesignToolbar,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps)
)

SamplingDesignToolbar.propTypes = {}
