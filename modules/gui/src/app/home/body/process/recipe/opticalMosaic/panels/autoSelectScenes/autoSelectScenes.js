import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RecipeActions} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import React from 'react'
import styles from './autoSelectScenes.module.css'

const fields = {
    min: new Form.Field(),
    max: new Form.Field()
}

class _AutoSelectScenes extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => this.recipeActions.autoSelectScenes(values).dispatch()}>
                <Panel.Header
                    icon='wand-sparkles'
                    title={msg('process.mosaic.panel.autoSelectScenes.title')}/>

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

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

export const AutoSelectScenes = compose(
    _AutoSelectScenes,
    recipeFormPanel({id: 'autoSelectScenes', fields})
)

AutoSelectScenes.propTypes = {}
