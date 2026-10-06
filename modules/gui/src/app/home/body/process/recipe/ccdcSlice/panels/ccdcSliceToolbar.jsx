import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {ChartPixelButton} from '~/app/home/body/process/recipe/chartPixelButton'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {RetrieveButton} from '../../retrieveButton'
import {withSourceProblems} from '../../selectedSource'
import {RecipeActions} from '../ccdcSliceRecipe'
import styles from './ccdcSliceToolbar.module.css'
import {ChartPixel} from './chartPixel'
import {Date} from './date/date'
import {Options} from './options/options'
import {Retrieve} from './retrieve/retrieve'
import {Source} from './source/source'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized')
})

class _CcdcSliceToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, sourceProblems} = this.props
        return (
            <PanelWizard
                panels={['source', 'date']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized ? <ChartPixel/> : null}
                <Retrieve/>
                <Source/>
                <Date/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized}
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}
                    />
                    <RetrieveButton tooltip={msg('process.ccdcSlice.panel.retrieve.tooltip')}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='source'
                        label={msg('process.ccdcSlice.panel.source.button')}
                        tooltip={sourceProblems.source || msg('process.ccdcSlice.panel.source.tooltip')}
                        error={!!sourceProblems.source}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='date'
                        label={msg('process.ccdcSlice.panel.date.button')}
                        tooltip={msg('process.ccdcSlice.panel.date.tooltip')}
                        disabled={!initialized}
                        panel/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.ccdcSlice.panel.options.button')}
                        tooltip={msg('process.ccdcSlice.panel.options.tooltip')}
                        panel/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const CcdcSliceToolbar = compose(
    _CcdcSliceToolbar,
    withSourceProblems(),
    withRecipe(mapRecipeToProps)
)

CcdcSliceToolbar.propTypes = {}
