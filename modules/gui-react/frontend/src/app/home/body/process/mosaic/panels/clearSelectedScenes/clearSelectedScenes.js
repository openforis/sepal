import {recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import {form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import {RecipeActions} from '../../mosaicRecipe'
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
            <Panel className={styles.panel}>
                <form>
                    <PanelHeader
                        icon='trash'
                        title={msg('process.mosaic.panel.sources.title')}/>

                    <PanelContent>
                        <Msg id='process.mosaic.panel.clearSelectedScenes.message'/>
                    </PanelContent>

                    <PanelButtons
                        statePath={recipePath(recipeId, 'ui')}
                        form={form}
                        isActionForm={true}
                        applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}
                        onApply={() => this.recipeActions.setSelectedScenes({}).dispatch()}/>
                </form>
            </Panel>
        )
    }
}

ClearSelectedScenes.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields})(ClearSelectedScenes)
