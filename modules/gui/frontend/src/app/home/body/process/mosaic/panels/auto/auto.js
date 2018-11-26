import {Constraint, ErrorMessage, Field, Input, Label, form} from 'widget/form'
import {Panel, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState, recipePath} from '../../mosaicRecipe'
import {msg} from 'translate'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
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
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                isActionForm={true}
                onApply={sceneCount => this.recipeActions.autoSelectScenes(sceneCount).dispatch()}>
                <PanelHeader
                    icon='magic'
                    title={msg('process.mosaic.panel.auto.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons
                    applyLabel={msg('process.mosaic.panel.auto.form.selectScenes')}/>
            </Panel>
        )
    }

    renderContent() {
        const {inputs: {min, max}} = this.props
        return (
            <div className={styles.form}>
                <Label msg={msg('process.mosaic.panel.auto.form.sceneCount')}/>
                <div className={styles.sceneCount}>
                    <Input
                        label={msg('process.mosaic.panel.auto.form.min.label')}
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        autoFocus
                        input={min}
                    />
                    <Input
                        label={msg('process.mosaic.panel.auto.form.max.label')}
                        type="number"
                        min={0}
                        max={999}
                        step={1}
                        input={max}
                    />
                </div>
                <ErrorMessage for={[min, max, 'minLessThanMax']}/>
            </div>
        )
    }
}

Auto.propTypes = {
    recipeId: PropTypes.string
}

export default form({fields, constraints, mapStateToProps})(Auto)
