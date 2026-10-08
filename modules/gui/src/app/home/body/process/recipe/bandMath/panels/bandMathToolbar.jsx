import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {withSourceProblems} from '../../selectedSource'
import {withOutputProblems} from '../../withOutputProblems'
import {inputBandProblems, missingBandsMessage} from '../inputBandProblems'
import styles from './bandMathToolbar.module.css'
import {Calculations} from './calculations/calculations'
import {InputImagery} from './inputImagery/inputImagery'
import {OutputBands} from './outputBands/outputBands'
import {Retrieve} from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _BandMathToolbar extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        const {recipeId, initialized, sourceProblems, inputBandProblems} = this.props
        const inputProblem = inputBandProblems[0]
        return (
            <PanelWizard
                panels={['inputImagery']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery inputBandProblems={inputBandProblems}/>
                <Calculations/>
                <OutputBands/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <RetrieveButton/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='inputImagery'
                        error={!!inputProblem}
                        label={msg('process.panels.inputImagery.button')}
                        tooltip={inputProblem
                            ? msg('process.requirement.itemProblem', {item: inputProblem.name, message: missingBandsMessage(inputProblem)})
                            : msg('process.panels.inputImagery.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='calculations'
                        error={!!sourceProblems.calculations}
                        label={msg('process.bandMath.panel.calculations.button')}
                        tooltip={sourceProblems.calculations || msg('process.bandMath.panel.calculations.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='outputBands'
                        error={!!sourceProblems.outputBands}
                        label={msg('process.bandMath.panel.outputBands.button')}
                        tooltip={sourceProblems.outputBands || msg('process.bandMath.panel.outputBands.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const BandMathToolbar = compose(
    _BandMathToolbar,
    withSourceProblems(),
    withOutputProblems({inputBandProblems}),
    withRecipe(mapRecipeToProps)
)
