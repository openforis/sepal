import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {hasConfidence} from '~/app/home/body/process/recipe/classChange/classChangeRecipe'
import {msg} from '~/translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    minConfidence: new Form.Field()
}

const mapRecipeToProps = recipe => ({recipe})

class _Options extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.classChange.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {minConfidence}, recipe} = this.props
        return (
            <Layout>
                <Form.Slider
                    label={msg('process.classChange.panel.options.minConfidence.label')}
                    tooltip={msg('process.classChange.panel.options.minConfidence.tooltip')}
                    input={minConfidence}
                    minValue={0}
                    maxValue={100}
                    ticks={[0, 10, 25, 50, 75, 90, 100]}
                    info={value => msg('process.classChange.panel.options.minConfidence.value', {value})}
                    disabled={!hasConfidence(recipe)}
                />
            </Layout>
        )
    }
}

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'options', fields, mapRecipeToProps})
)
