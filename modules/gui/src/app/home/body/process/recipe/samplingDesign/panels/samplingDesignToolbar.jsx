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

import {SectionButton} from '../../requirements/sectionButton'
import {RetrieveButton} from '../../retrieve/retrieveButton'
import {samplesGate, samplesGateMessage} from '../freshnessRequirements'
import {retrieveButtonState} from '../sampling/retrieveButtonState'
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
    samplesGate: samplesGate(recipe),
    initialized: selectFrom(recipe, 'ui.initialized')
})

const retrieveTooltip = ({kind, code, args, gate}) => {
    if (kind === 'model') {
        return `${msg('process.samplingDesign.retrieve.invalid')} ${msg(`process.samplingDesign.retrieve.invalid.${code}`, args)}`
    }
    if (kind === 'capability') {
        return msg(`process.samplingDesign.retrieve.capability.${code}`)
    }
    if (kind === 'freshness') {
        return samplesGateMessage(gate)
    }
    return undefined
}

class _SamplingDesignToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, model, samplesGate, googleAccount, assetRoots, initialized} = this.props
        const buttonState = retrieveButtonState({model, googleAccount, assetRoots, gate: samplesGate})
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
                    <SectionButton
                        id='stratification'
                        label={msg('process.samplingDesign.panel.stratification.button')}
                        tooltip={msg('process.samplingDesign.panel.stratification.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <SectionButton
                        id='proportions'
                        label={msg('process.samplingDesign.panel.proportions.button')}
                        tooltip={msg('process.samplingDesign.panel.proportions.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <SectionButton
                        id='sampleAllocation'
                        label={msg('process.samplingDesign.panel.sampleAllocation.button')}
                        tooltip={msg('process.samplingDesign.panel.sampleAllocation.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <SectionButton
                        id='sampleArrangement'
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
