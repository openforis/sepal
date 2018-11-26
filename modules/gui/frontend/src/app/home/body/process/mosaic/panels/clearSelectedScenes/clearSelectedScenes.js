import {Msg, msg} from 'translate'
import Panel, { PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../mosaicRecipe'
import {form} from 'widget/form'
import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
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
        const {recipeId, form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                isActionForm={true}
                onApply={() => this.recipeActions.setSelectedScenes({}).dispatch()}>
                <PanelHeader
                    icon='trash'
                    title={msg('process.mosaic.panel.sources.title')}/>

                <PanelContent>
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

export default form({fields})(ClearSelectedScenes)
