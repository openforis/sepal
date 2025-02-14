import React from 'react'

import {setInitialized} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {PanelWizard} from '~/widget/panelWizard'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {ChartPixelButton} from '../../ccdc/panels/chartPixelButton'
import {RetrieveButton} from '../../retrieveButton'
import {RecipeActions} from '../ccdcSliceRecipe'
import styles from './ccdcSliceToolbar.module.css'
import {ChartPixel} from './chartPixel'
import {Date} from './date/date'
import {Options} from './options/options'
import {Retrieve} from './retrieve/retrieve'
import {Source} from './source/source'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    hasBaseBands: selectFrom(recipe, 'model.source.baseBands')?.length > 0
})

class _CcdcSliceToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, hasBaseBands} = this.props
        return (
            <PanelWizard
                panels={['source', 'date']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized && hasBaseBands ? <ChartPixel/> : null}
                <Retrieve/>
                <Source/>
                <Date/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized || !hasBaseBands}
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}
                    />
                    <RetrieveButton disabled={!hasBaseBands} tooltip={msg('process.ccdcSlice.panel.retrieve.tooltip')}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='source'
                        label={msg('process.ccdcSlice.panel.source.button')}
                        tooltip={msg('process.ccdcSlice.panel.source.tooltip')}
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
    withRecipe(mapRecipeToProps)
)

CcdcSliceToolbar.propTypes = {}
