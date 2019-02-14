import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {Field, form} from 'widget/form'
import FormPanel, {FormPanelButtons} from 'widget/formPanel'
import Label from 'widget/label'
import {PanelContent, PanelHeader} from 'widget/panel'
import Slider from 'widget/slider'
import {RecipeActions} from '../../mosaicRecipe'
import styles from './auto.module.css'

const fields = {
    min: new Field(),
    max: new Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    values: selectFrom(recipe, 'ui.sceneCount')
})

class Auto extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {form} = this.props
        return (
            <FormPanel
                id='auto'
                className={styles.panel}
                form={form}
                isActionForm={true}
                placement='top-right'
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
}

export default withRecipe(mapRecipeToProps)(
    form({fields})(
        Auto
    )
)
