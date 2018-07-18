import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import {Constraint, ErrorMessage, Field, form, Input} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import {RecipeActions, recipePath, RecipeState} from '../../mosaicRecipe'
import styles from './auto.module.css'

const fields = {
    min: new Field()
        .int('process.mosaic.panel.auto.form.min.atLeast1')
        .min(1, 'process.mosaic.panel.auto.form.min.atLeast1'),
    max: new Field()
        .int('process.mosaic.panel.auto.form.max.atLeast1')
        .min(1, 'process.mosaic.panel.auto.form.max.atLeast1')
}

const constraints = {
    minLessThanMax: new Constraint(['min', 'max'])
        .predicate(({min, max}) => {
            return +min <= +max
        }, 'process.mosaic.panel.auto.form.minLessThanMax')
}

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        values: recipeState('ui.sceneCount')
    }
}

class Auto extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel className={styles.panel}>
                <PanelHeader
                    icon='magic'
                    title={msg('process.mosaic.panel.auto.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    statePath={recipePath(recipeId, 'ui')}
                    form={form}
                    isActionForm={true}
                    applyLabel={msg('process.mosaic.panel.auto.form.selectScenes')}
                    onApply={(sceneCount) => this.recipeActions.autoSelectScenes(sceneCount).dispatch()}/>
            </Panel>
        )
    }


    renderContent() {
        const {inputs: {min, max}} = this.props
        return (
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
                    </div>
                    <div>
                        <label><Msg id='process.mosaic.panel.auto.form.max.label'/></label>
                        <Input
                            type="number"
                            min={0}
                            max={999}
                            step={1}
                            input={max}/>
                    </div>
                </div>
                <ErrorMessage for={[min, max, 'minLessThanMax']}/>
            </div>
        )
    }
}

Auto.propTypes = {
    recipeId: PropTypes.string,
    form: PropTypes.object,
    fields: PropTypes.object,
    constraints: PropTypes.shape({}),
    action: PropTypes.func,
    values: PropTypes.object
}

export default form({fields, constraints, mapStateToProps})(Auto)
