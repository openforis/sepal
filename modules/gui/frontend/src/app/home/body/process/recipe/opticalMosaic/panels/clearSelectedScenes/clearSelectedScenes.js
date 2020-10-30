import {Form} from 'widget/form/form'
import {Msg, msg} from 'translate'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
// setSelectedScenes
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import React from 'react'
import styles from './clearSelectedScenes.module.css'

const fields = {}

class ClearSelectedScenes extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={() => this.recipeActions.setSelectedScenes({}).dispatch()}>
                <Panel.Header
                    icon='trash'
                    title={msg('process.mosaic.panel.clearSelectedScenes.title')}/>

                <Panel.Content className={styles.content}>
                    <Msg id='process.mosaic.panel.clearSelectedScenes.message'/>
                </Panel.Content>

                <Form.PanelButtons applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}/>
            </RecipeFormPanel>
        )
    }
}

ClearSelectedScenes.propTypes = {}

export default compose(
    ClearSelectedScenes,
    recipeFormPanel({id: 'clearSelectedScenes', fields})
)
