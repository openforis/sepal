import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import {form} from 'widget/form'
import {RecipeActions} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './clearSelectedScenes.module.css'

const fields = {}

class ClearSelectedScenes extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, form, className} = this.props
        return (
            <form className={[className, styles.container].join(' ')}>
                <PanelForm
                    recipeId={recipeId}
                    form={form}
                    applyLabel={msg('process.mosaic.panel.clearSelectedScenes.apply')}
                    isActionForm={true}
                    onApply={() => this.recipe.setSelectedScenes({}).dispatch()}
                    icon='trash'
                    title={msg('process.mosaic.panel.clearSelectedScenes.title')}>
                    <Msg id='process.mosaic.panel.clearSelectedScenes.message'/>
                </PanelForm>
            </form>
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
