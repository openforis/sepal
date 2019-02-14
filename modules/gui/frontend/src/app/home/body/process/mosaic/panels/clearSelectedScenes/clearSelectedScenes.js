import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {form} from 'widget/form'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../mosaicRecipe'
import styles from './clearSelectedScenes.module.css'

const fields = {}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id
})

class ClearSelectedScenes extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {form} = this.props
        return (
            <FormPanel
                id='clearSelectedScenes'
                className={styles.panel}
                form={form}
                isActionForm={true}
                placement='top-right'
                onApply={() => this.recipeActions.setSelectedScenes({}).dispatch()}>
                <PanelHeader
                    icon='trash'
                    title={msg('process.mosaic.panel.clearSelectedScenes.title')}/>

                <PanelContent className={styles.content}>
                    <Msg id='process.mosaic.panel.clearSelectedScenes.message'/>
                </PanelContent>

                <FormPanelButtons
                    applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}/>
            </FormPanel>
        )
    }
}

ClearSelectedScenes.propTypes = {
    recipeId: PropTypes.string
}

export default withRecipe(mapRecipeToProps)(
    form({fields})(ClearSelectedScenes)
)
