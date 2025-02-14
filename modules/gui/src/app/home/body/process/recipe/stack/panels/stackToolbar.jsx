import React from 'react'

import {InputImagery} from '~/app/home/body/process/panels/inputImagery/inputImagery'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../stackRecipe'
import {BandNames} from './bandNames/bandNames'
import {toBandNames} from './bandNames/bandNamesUpdate'
import {Retrieve} from './retrieve/retrieve'
import styles from './stackToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    bandNames: selectFrom(recipe, 'model.bandNames'),
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _StackToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.syncBandNames = this.syncBandNames.bind(this)
    }

    render() {
        const {recipeId, initialized} = this.props
        return (
            <PanelWizard
                panels={['inputImagery']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery onChange={this.syncBandNames}/>
                <BandNames/>

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
                        id='bandNames'
                        label={msg('process.stack.panel.bandNames.button')}
                        tooltip={msg('process.stack.panel.bandNames.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }

    syncBandNames(images) {
        const {recipeId, bandNames: {bandNames: prevBandNames}} = this.props
        // const bandNames = toBandNames(images, undefined)
        const bandNames = toBandNames(images, prevBandNames)
        RecipeActions(recipeId).syncBandNames(bandNames)
    }
}

export const StackToolbar = compose(
    _StackToolbar,
    withRecipe(mapRecipeToProps)
)
