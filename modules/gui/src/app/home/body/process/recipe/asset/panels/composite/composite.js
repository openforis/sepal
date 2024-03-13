import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import React from 'react'
import styles from './composite.module.css'

const fields = {
    type: new Form.Field()
        .notEmpty(),
}

class _Composite extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='calendar-alt'
                    title={msg('process.asset.panel.composite.title')}/>
                <Panel.Content>
                    <Layout>
                        {this.renderContents()}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContents() {
        const {inputs: {type}} = this.props
        const toOption = value => ({
            value,
            label: msg(`process.asset.panel.composite.form.type.${value}.label`),
            tooltip: msg(`process.asset.panel.composite.form.type.${value}.tooltip`)
        })
        const options = ['MOSAIC', 'MEDIAN', 'MEAN', 'MIN', 'MAX', 'MODE'].map(toOption)
        return (
            <Form.Buttons
                label={msg('process.asset.panel.composite.form.type.label')}
                input={type}
                options={options}
            />
        )
    }

}

export const Composite = compose(
    _Composite,
    recipeFormPanel({id: 'composite', fields})
)

Composite.propTypes = {}
