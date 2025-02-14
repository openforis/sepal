import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './sampleArrangement.module.css'

const mapRecipeToProps = recipe => ({
    aoi: selectFrom(recipe, 'model.aoi') || []
})

const fields = {
    requiresUpdate: new Form.Field(),
    strategy: new Form.Field(),
    seed: new Form.Field()
        .skip((_seed, {strategy}) => includeSeed(strategy))
        .notBlank()
        .int(),
}

class _SampleArrangement extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='border-none'
                    title={msg('process.samplingDesign.panel.sampleArrangement.title')}/>
            
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {strategy}} = this.props
        return (
            <Layout>
                {this.renderStrategy()}
                {includeSeed(strategy.value) ? this.renderSeed() : null}
            </Layout>
        )
    }

    renderStrategy() {
        const {inputs: {strategy}} = this.props
        return (
            <Form.Buttons
                label={msg('process.samplingDesign.panel.sampleArrangement.form.strategy.label')}
                input={strategy}
                options={[
                    {
                        value: 'RANDOM',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.strategy.RANDOM.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.strategy.RANDOM.tooltip')
                    },
                    {
                        value: 'SYSTEMATIC',
                        label: msg('process.samplingDesign.panel.sampleArrangement.form.strategy.SYSTEMATIC.label'),
                        tooltip: msg('process.samplingDesign.panel.sampleArrangement.form.strategy.SYSTEMATIC.tooltip')
                    },
                ]}
            />
        )
    }

    renderSeed() {
        const {inputs: {seed}} = this.props
        return (
            <Form.Input
                label={msg('process.samplingDesign.panel.sampleArrangement.form.seed.label')}
                tooltip={msg('process.samplingDesign.panel.sampleArrangement.form.seed.tooltip')}
                placeholder={msg('process.samplingDesign.panel.sampleArrangement.form.seed.placeholder')}
                input={seed}
            />
        )
    }

    componentDidMount() {
        const {inputs: {requiresUpdate, strategy}} = this.props
        requiresUpdate.set(false)
        strategy.value || strategy.set('RANDOM')
    }

}

const includeSeed = strategy =>
    strategy === 'RANDOM'

const valuesToModel = values => {
    return values
}

const modelToValues = model => {
    return model
}

export const SampleArrangement = compose(
    _SampleArrangement,
    recipeFormPanel({id: 'sampleArrangement', fields, mapRecipeToProps, modelToValues, valuesToModel})
)

SampleArrangement.propTypes = {
    recipeId: PropTypes.string
}
