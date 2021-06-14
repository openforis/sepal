import {RecipeActions} from '../ccdcSliceRecipe'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import ChartPixel from './chartPixel'
import ChartPixelButton from '../../ccdc/panels/chartPixelButton'
import Date from './date/date'
import Options from './options/options'
import PanelWizard from 'widget/panelWizard'
import React from 'react'
import Retrieve from './retrieve/retrieve'
import Source from './source/source'
import styles from './ccdcSliceToolbar.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    baseBands: selectFrom(recipe, 'model.source.baseBands'),
})

class CcdcSliceToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, initialized, baseBands} = this.props

        return (
            <PanelWizard
                panels={['source', 'date']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>
                {initialized && baseBands ? <ChartPixel/> : null}
                <Retrieve/>
                <Source/>
                <Date/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <ChartPixelButton
                        disabled={!initialized || !baseBands}
                        onPixelSelected={latLng => this.recipeActions.setChartPixel(latLng)}
                    />
                    <Toolbar.ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.ccdcSlice.panel.retrieve.tooltip')}
                        disabled={!initialized || !baseBands}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='source'
                        label={msg('process.ccdcSlice.panel.source.button')}
                        tooltip={msg('process.ccdcSlice.panel.source.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='date'
                        label={msg('process.ccdcSlice.panel.date.button')}
                        tooltip={msg('process.ccdcSlice.panel.date.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='options'
                        label={msg('process.ccdcSlice.panel.options.button')}
                        tooltip={msg('process.ccdcSlice.panel.options.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

CcdcSliceToolbar.propTypes = {}

export default compose(
    CcdcSliceToolbar,
    withRecipe(mapRecipeToProps)
)
