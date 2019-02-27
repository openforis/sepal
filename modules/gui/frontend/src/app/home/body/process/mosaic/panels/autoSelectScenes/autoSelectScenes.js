import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import Label from 'widget/label'
import React from 'react'
import Slider from 'widget/slider'
import styles from './autoSelectScenes.module.css'

const fields = {
    min: new Field(),
    max: new Field()
}

class AutoSelectScenes extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => RecipeActions(recipeId).autoSelectScenes(values).dispatch()}>
                <PanelHeader
                    icon='magic'
                    title={msg('process.mosaic.panel.autoSelectScenes.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <FormPanelButtons
                    applyLabel={msg('process.mosaic.panel.autoSelectScenes.form.selectScenes')}/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {min, max}} = this.props
        return (
            <React.Fragment>
                <div>
                    <Label msg={msg('process.mosaic.panel.autoSelectScenes.form.min.label')}/>
                    <Slider
                        input={min}
                        minValue={1}
                        maxValue={max.value}
                        ticks={[1, 2, 5, 10, 20, 50, 100, 200, 500, {value: 999, label: 'max'}]}
                        snap
                        logScale
                        range='low'/>
                </div>
                <div>
                    <Label msg={msg('process.mosaic.panel.autoSelectScenes.form.max.label')}/>
                    <Slider
                        input={max}
                        minValue={min.value}
                        maxValue={999}
                        ticks={[1, 2, 5, 10, 20, 50, 100, 200, 500, {value: 999, label: 'max'}]}
                        snap
                        logScale
                        range='low'/>
                </div>
            </React.Fragment>
        )
    }
}

AutoSelectScenes.propTypes = {}

export default recipeFormPanel({id: 'autoSelectScenes', fields})(AutoSelectScenes)
