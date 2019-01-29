import {withRecipePath} from 'app/home/body/process/recipe'
import {Msg, msg} from 'translate'
import {RecipeActions} from '../../mosaicRecipe'
import {form} from 'widget/form'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './clearSelectedScenes.module.css'

const fields = {}

class ClearSelectedScenes extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipePath, form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                isActionForm={true}
                onApply={() => this.recipeActions.setSelectedScenes({}).dispatch()}>
                <PanelHeader
                    icon='trash'
                    title={msg('process.mosaic.panel.clearSelectedScenes.title')}/>

                <PanelContent className={styles.content}>
                    <Msg id='process.mosaic.panel.clearSelectedScenes.message'/>
                </PanelContent>

                <PanelButtons
                    applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}/>
            </Panel>
        )
    }
}

ClearSelectedScenes.propTypes = {
    recipeId: PropTypes.string
}

export default withRecipePath()(
    form({fields})(ClearSelectedScenes)
)
