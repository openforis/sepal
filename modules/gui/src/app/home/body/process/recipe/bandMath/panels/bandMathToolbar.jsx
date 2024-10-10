import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
// import {RecipeActions} from '../bandMathRecipe'
import styles from './bandMathToolbar.module.css'
import {Calculations} from './calculations/calculations'
import {InputImagery} from './inputImagery/inputImagery'
// import {toBandNames} from './outputBands/bandNamesUpdate'
import {OutputBands} from './outputBands/outputBands'
import {Retrieve} from './retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    // bandNames: selectFrom(recipe, 'model.bandNames'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _BandMathToolbar extends React.Component {
    constructor(props) {
        super(props)
        // this.syncBandNames = this.syncBandNames.bind(this)
    }

    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery
                    // onChange={this.syncBandNames}
                />
                <Calculations
                    // onChange={this.syncBandNames}
                />
                <OutputBands/>

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
                        id='inputImagery'
                        label={msg('process.panels.inputImagery.button')}
                        tooltip={msg('process.panels.inputImagery.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='calculations'
                        label={msg('process.bandMath.panel.calculations.button')}
                        tooltip={msg('process.bandMath.panel.calculations.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='outputBands'
                        label={msg('process.bandMath.panel.outputBands.button')}
                        tooltip={msg('process.bandMath.panel.outputBands.tooltip')}
                        disabled={!initialized}/>

                </Toolbar>
            </PanelWizard>
        )
    }

    // syncBandNames(images) {
    //     const {recipeId, bandNames: {bandNames: prevBandNames}} = this.props
    //     // const bandNames = toBandNames(images, undefined)
    //     const bandNames = toBandNames(images, prevBandNames)
    //     RecipeActions(recipeId).syncBandNames(bandNames)
    // }
}

export const BandMathToolbar = compose(
    _BandMathToolbar,
    withRecipe(mapRecipeToProps)
)
