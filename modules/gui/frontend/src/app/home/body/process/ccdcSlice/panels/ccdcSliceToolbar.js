import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Date from './date/date'
import PanelWizard from 'widget/panelWizard'
import Options from './options/options'
import React from 'react'
import Retrieve from './retrieve/retrieve'
import Source from './source/source'
import styles from './ccdcSliceToolbar.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    initialized: selectFrom(recipe, 'ui.initialized'),
    bands:  selectFrom(recipe, 'model.source.bands')
})

class CcdcSliceToolbar extends React.Component {
    render() {
        const {recipeId, initialized, bands} = this.props
        return (
            <PanelWizard
                panels={['source', 'date']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <Retrieve/>
                <Source/>
                <Date/>
                <Options/>

                <Toolbar
                    vertical
                    placement='top-right'
                    className={styles.top}>
                    <Toolbar.ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.ccdcSlice.panel.retrieve.tooltip')}
                        disabled={!initialized || !bands}/>
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
