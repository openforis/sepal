import {Field, form} from 'widget/form'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState} from '../../mosaicRecipe'
import {msg} from 'translate'
import {withRecipePath} from 'app/home/body/process/recipe'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import Slider from 'widget/slider'
import styles from './auto.module.css'

const fields = {
    min: new Field(),
    max: new Field()
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
        const {recipePath, form} = this.props
        return (
            <FormPanel
                className={styles.panel}
                form={form}
                statePath={recipePath + '.ui'}
                isActionForm={true}
                onApply={sceneCount => this.recipeActions.autoSelectScenes(sceneCount).dispatch()}>
                <PanelHeader
                    icon='magic'
                    title={msg('process.mosaic.panel.auto.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons
                    applyLabel={msg('process.mosaic.panel.auto.form.selectScenes')}/>
            </FormPanel>
        )
    }

    renderContent() {
        const {inputs: {min, max}} = this.props
        return (
            <React.Fragment>
                <div>
                    <Label msg={msg('process.mosaic.panel.auto.form.min.label')}/>
                    <Slider
                        input={min}
                        minValue={1}
                        maxValue={max.value}
                        ticks={[1, 2, 5, 10, 20, 50, 100, 200, 500, {value: 999, label: 'max'}]}
                        snap
                        logScale
                        range='left'/>
                </div>
                <div>
                    <Label msg={msg('process.mosaic.panel.auto.form.max.label')}/>
                    <Slider
                        input={max}
                        minValue={min.value}
                        maxValue={999}
                        ticks={[1, 2, 5, 10, 20, 50, 100, 200, 500, {value: 999, label: 'max'}]}
                        snap
                        logScale
                        range='left'/>
                </div>
            </React.Fragment>
        )
    }
}

Auto.propTypes = {
    recipeId: PropTypes.string
}

export default withRecipePath()(
    form({fields, mapStateToProps})(Auto)
)
