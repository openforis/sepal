import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import {Constraints, ErrorMessage, form, Input} from 'widget/form'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import PanelForm from '../panelForm'
import styles from './auto.module.css'

const inputs = {
    min: new Constraints(),
    max: new Constraints()
}

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    console.log(recipe('ui.sceneCount'))
    return {
        values: recipe('ui.sceneCount'),
        recipeState: recipe()
    }
}

class Auto extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, form, inputs: {min, max}, className} = this.props
        return (
            <form className={[className, styles.container].join(' ')}>
                <PanelForm
                    recipeId={recipeId}
                    form={form}
                    applyLabel={msg('process.mosaic.panel.auto.form.selectScenes')}
                    isActionForm={true}
                    onApply={(recipe, sceneCount) => recipe.autoSelectScenes(sceneCount).dispatch()}
                    icon='cog'
                    title={msg('process.mosaic.panel.auto.title')}>
                    <div className={styles.form}>
                        <label><Msg id='process.mosaic.panel.auto.form.sceneCount'/></label>
                        <div className={styles.sceneCount}>
                            <div>
                                <label><Msg id='process.mosaic.panel.auto.form.min.label'/></label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={999}
                                    step={1}
                                    autoFocus
                                    input={min}/>
                                <ErrorMessage input={min}/>
                            </div>
                            <div>
                                <label><Msg id='process.mosaic.panel.auto.form.max.label'/></label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={999}
                                    step={1}
                                    input={max}/>
                                <ErrorMessage input={max}/>
                            </div>
                        </div>
                    </div>
                </PanelForm>
            </form>
        )
    }
}

Auto.propTypes = {
    recipeId: PropTypes.string,
    className: PropTypes.string,
    form: PropTypes.object,
    inputs: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form(inputs, mapStateToProps)(Auto)
