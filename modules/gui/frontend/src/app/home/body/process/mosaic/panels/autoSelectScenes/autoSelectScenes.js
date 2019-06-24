import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './autoSelectScenes.module.css'

const fields = {
    min: new Form.Field(),
    max: new Form.Field()
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

                <Form.PanelButtons
                    applyLabel={msg('process.mosaic.panel.autoSelectScenes.form.selectScenes')}/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {min, max}} = this.props
        return (
            <Layout>
                <Form.Slider
                    label={msg('process.mosaic.panel.autoSelectScenes.form.min.label')}
                    input={min}
                    minValue={1}
                    maxValue={max.value}
                    ticks={[1, 2, 5, 10, 20, 50, 100, 200, 500, {value: 999, label: 'max'}]}
                    snap
                    scale='log'
                    range='low'/>
                <Form.Slider
                    label={msg('process.mosaic.panel.autoSelectScenes.form.max.label')}
                    input={max}
                    minValue={min.value}
                    maxValue={999}
                    ticks={[1, 2, 5, 10, 20, 50, 100, 200, 500, {value: 999, label: 'max'}]}
                    snap
                    scale='log'
                    range='low'/>
            </Layout>
        )
    }
}

AutoSelectScenes.propTypes = {}

export default compose(
    AutoSelectScenes,
    recipeFormPanel({id: 'autoSelectScenes', fields})
)
