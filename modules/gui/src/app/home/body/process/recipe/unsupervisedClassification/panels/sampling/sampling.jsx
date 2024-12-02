import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {NumberButtons} from '~/widget/numberButtons'
import {Panel} from '~/widget/panel/panel'

import styles from './sampling.module.css'

const fields = {
    numberOfSamples: new Form.Field()
        .notBlank()
        .int()
        .min(2)
        .max(2147483647),
    sampleScale: new Form.Field()
        .notBlank()
        .number()
        .greaterThan(0)
        .max(2147483647)
}

class _Sampling extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='cog'
                    title={msg('process.unsupervisedClassification.panel.sampling.title')}/>

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        return (
            <Layout>
                {this.renderNumberOfSamples()}
                {this.renderSampleScale()}
            </Layout>
        )
    }

    renderNumberOfSamples() {
        const {inputs: {numberOfSamples}} = this.props
        const options = [
            {value: 1e2, label: '100'},
            {value: 1e3, label: '1K'},
            {value: 1e4, label: '10K'},
            {value: 1e5, label: '100K'},
            {value: 1e6, label: '1M'},
        ]
        return (
            <NumberButtons
                label={msg('process.unsupervisedClassification.panel.sampling.form.numberOfSamples.label')}
                placeholder={msg('process.unsupervisedClassification.panel.sampling.form.numberOfSamples.placeholder')}
                tooltip={msg('process.unsupervisedClassification.panel.sampling.form.numberOfSamples.tooltip')}
                input={numberOfSamples}
                options={options}
                suffix={msg('process.unsupervisedClassification.panel.sampling.form.numberOfSamples.suffix')}
            />
        )
    }

    renderSampleScale() {
        const {inputs: {sampleScale}} = this.props
        return (
            <NumberButtons
                label={msg('process.unsupervisedClassification.panel.sampling.form.sampleScale.label')}
                placeholder={msg('process.unsupervisedClassification.panel.sampling.form.sampleScale.placeholder')}
                tooltip={msg('process.unsupervisedClassification.panel.sampling.form.sampleScale.tooltip')}
                input={sampleScale}
                options={[3, 5, 10, 15, 20, 30, 60, 100, 200, 500]}
                suffix={msg('process.unsupervisedClassification.panel.sampling.form.sampleScale.suffix')}
            />
        )
    }
}

export const Sampling = compose(
    _Sampling,
    recipeFormPanel({id: 'sampling', fields})
)

