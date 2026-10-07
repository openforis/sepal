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
        const {recipeId, initialized, sourceProblems} = this.props
        return (
            <PanelWizard
                panels={['inputImagery']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
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
                        label={msg('process.panels.inputImagery.button')}
                        tooltip={msg('process.panels.inputImagery.tooltip')}
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
    withRecipe(mapRecipeToProps)
)
