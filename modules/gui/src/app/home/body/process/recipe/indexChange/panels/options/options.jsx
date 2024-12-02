import React from 'react'

import {hasError} from '~/app/home/body/process/recipe/indexChange/indexChangeRecipe'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

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
                    title={msg('process.indexChange.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {minConfidence}, recipe} = this.props
        // TODO: Better name?
        return (
            <Layout>
                <Form.Slider
                    label={msg('process.indexChange.panel.options.minConfidence.label')}
                    tooltip={msg('process.indexChange.panel.options.minConfidence.tooltip')}
                    input={minConfidence}
                    minValue={0}
                    maxValue={20}
                    decimals={1}
                    ticks={[0, 1, 2, 3, 5, 10, 20]}
                    scale='log'
                    info={value => msg('process.indexChange.panel.options.minConfidence.value', {value})}
                    disabled={!hasError(recipe)}
                />
            </Layout>
        )
    }
}

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'options', fields, mapRecipeToProps})
)
