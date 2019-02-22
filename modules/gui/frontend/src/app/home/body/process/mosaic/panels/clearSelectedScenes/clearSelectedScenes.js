import {FormPanelButtons} from 'widget/formPanel'
import {Msg, msg} from 'translate'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import React from 'react'
import styles from './clearSelectedScenes.module.css'

const fields = {}

class ClearSelectedScenes extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={() => RecipeActions(recipeId).setSelectedScenes({}).dispatch()}>
                <PanelHeader
                    icon='trash'
                    title={msg('process.mosaic.panel.clearSelectedScenes.title')}/>

                <PanelContent className={styles.content}>
                    <Msg id='process.mosaic.panel.clearSelectedScenes.message'/>
                </PanelContent>

                <FormPanelButtons applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}/>
            </RecipeFormPanel>
        )
    }
}

ClearSelectedScenes.propTypes = {}

export default recipeFormPanel({id: 'clearSelectedScenes', fields})(ClearSelectedScenes)
