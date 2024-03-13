import {Form} from '~/widget/form'
import {Message} from '~/widget/message'
import {Panel} from '~/widget/panel/panel'
import {RecipeActions} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import React from 'react'
import styles from './clearSelectedScenes.module.css'

const fields = {}

class _ClearSelectedScenes extends React.Component {
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
                    <Message text={msg('process.mosaic.panel.clearSelectedScenes.message')} centered/>
                </Panel.Content>

                <Form.PanelButtons applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}/>
            </RecipeFormPanel>
        )
    }
}

export const ClearSelectedScenes = compose(
    _ClearSelectedScenes,
    recipeFormPanel({id: 'clearSelectedScenes', fields})
)

ClearSelectedScenes.propTypes = {}
