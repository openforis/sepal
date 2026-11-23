import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './preprocess.module.css'
import {preprocessing} from './preprocessing'

const fields = {
    orbits: new Form.Field()
        .notEmpty('process.dias.panel.preprocess.form.orbits.required'),
    cloudMasking: new Form.Field()
        .notBlank()
}

const mapRecipeToProps = recipe => ({
    dataSetIds: toDataSetIds(selectFrom(recipe, 'model.sources.dataSets'))
})

class _Preprocess extends React.Component {
    render() {
        const {dataSetIds} = this.props
        const {orbits, cloudMasking} = preprocessing(dataSetIds)
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.dias.panel.preprocess.title')}/>
                <Panel.Content>
                    <Layout>
                        {orbits ? this.renderOrbits() : null}
                        {cloudMasking ? this.renderCloudMasking() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderOrbits() {
        const {inputs: {orbits}} = this.props
        return (
            <Form.Buttons
                label={msg('process.dias.panel.preprocess.form.orbits.label')}
                input={orbits}
                options={[
                    {value: 'ASCENDING', label: msg('process.dias.panel.preprocess.form.orbits.ASCENDING')},
                    {value: 'DESCENDING', label: msg('process.dias.panel.preprocess.form.orbits.DESCENDING')}
                ]}
                multiple
            />
        )
    }

    renderCloudMasking() {
        const {inputs: {cloudMasking}} = this.props
        return (
            <Form.Buttons
                label={msg('process.dias.panel.preprocess.form.cloudMasking.label')}
                tooltip={msg('process.dias.panel.preprocess.form.cloudMasking.tooltip')}
                input={cloudMasking}
                options={[
                    {value: 'OFF', label: msg('process.dias.panel.preprocess.form.cloudMasking.OFF')},
                    {value: 'LIGHT', label: msg('process.dias.panel.preprocess.form.cloudMasking.LIGHT'), tooltip: msg('process.dias.panel.preprocess.form.cloudMasking.LIGHT.tooltip')},
                    {value: 'MODERATE', label: msg('process.dias.panel.preprocess.form.cloudMasking.MODERATE'), tooltip: msg('process.dias.panel.preprocess.form.cloudMasking.MODERATE.tooltip')},
                    {value: 'AGGRESSIVE', label: msg('process.dias.panel.preprocess.form.cloudMasking.AGGRESSIVE'), tooltip: msg('process.dias.panel.preprocess.form.cloudMasking.AGGRESSIVE.tooltip')}
                ]}
            />
        )
    }
}

export const Preprocess = compose(
    _Preprocess,
    recipeFormPanel({id: 'diasPreprocess', fields, mapRecipeToProps})
)

Preprocess.propTypes = {}
