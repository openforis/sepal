import React from 'react'

import {InputImagery} from '~/app/home/body/process/panels/inputImagery/inputImagery'
import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {withOutputProblems} from '../../outputs/withOutputProblems'
import {SectionButton} from '../../requirements/sectionButton'
import {RetrieveButton} from '../../retrieve/retrieveButton'
import {bandNamesProblemMessage, bandNamesProblems} from '../bandNamesProblems'
import {BandNames} from './bandNames/bandNames'
import {Retrieve} from './retrieve/retrieve'
import styles from './stackToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
})

class _StackToolbar extends React.Component {
    render() {
        const {recipeId, initialized, bandNamesProblems} = this.props
        const bandNamesProblem = bandNamesProblems[0]
        return (
            <PanelWizard
                panels={['inputImagery']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                <Retrieve/>
                <InputImagery/>
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
                    <SectionButton
                        id='inputImagery'
                        label={msg('process.panels.inputImagery.button')}
                        tooltip={msg('process.panels.inputImagery.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='bandNames'
                        error={!!bandNamesProblem}
                        label={msg('process.stack.panel.bandNames.button')}
                        tooltip={bandNamesProblem
                            ? msg('process.requirement.itemProblem', {item: bandNamesProblem.name, message: bandNamesProblemMessage(bandNamesProblem)})
                            : msg('process.stack.panel.bandNames.tooltip')}
                        disabled={!initialized}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const StackToolbar = compose(
    _StackToolbar,
    withOutputProblems({bandNamesProblems}),
    withRecipe(mapRecipeToProps)
)
