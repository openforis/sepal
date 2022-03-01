import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {MosaicPreview} from 'app/home/body/process/recipe/mosaic/mosaicPreview'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from 'app/home/body/process/recipe/classification/classificationRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './auxiliaryImagery.module.css'

const fields = {
    included: new Form.Field()
}

class AuxiliaryImagery extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        this.preview = MosaicPreview(recipeId)
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}
                onClose={() => this.preview.show()}>
                <Panel.Header
                    icon='cog'
                    title={msg('process.classification.panel.auxiliaryImagery.title')}/>

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {included}} = this.props
        const options = [
            {
                value: 'LATITUDE',
                label: msg(['process.classification.panel.auxiliaryImagery.form.options.latitude.label']),
                tooltip: msg(['process.classification.panel.auxiliaryImagery.form.options.latitude.tooltip'])
            },
            {
                value: 'TERRAIN',
                label: msg(['process.classification.panel.auxiliaryImagery.form.options.terrain.label']),
                tooltip: msg(['process.classification.panel.auxiliaryImagery.form.options.terrain.tooltip'])
            },
            {
                value: 'WATER',
                label: msg(['process.classification.panel.auxiliaryImagery.form.options.water.label']),
                tooltip: msg(['process.classification.panel.auxiliaryImagery.form.options.water.tooltip'])
            }
        ]
        return (
            <Layout>
                <Form.Buttons
                    label={msg(['process.classification.panel.auxiliaryImagery.form.options.label'])}
                    input={included}
                    options={options}
                    multiple/>
            </Layout>
        )
    }

    componentDidMount() {
        this.preview.hide()
    }
}

AuxiliaryImagery.propTypes = {
    recipeId: PropTypes.string
}

const valuesToModel = values => {
    return [...values.included]
}

const modelToValues = model => {
    return {
        included: [...model]
    }
}
export default compose(
    AuxiliaryImagery,
    recipeFormPanel({id: 'auxiliaryImagery', fields, modelToValues, valuesToModel})
)
