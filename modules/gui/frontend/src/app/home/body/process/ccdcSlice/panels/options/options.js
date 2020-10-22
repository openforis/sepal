import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    harmonics: new Form.Field(),
    gapStrategy: new Form.Field(),
    extrapolateSegment: new Form.Field(),
    extrapolateMaxDays: new Form.Field()
}

class Options extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='cog'
                    title={msg('process.ccdcSlice.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {gapStrategy}} = this.props
        return (
            <Layout>
                {this.renderHarmonics()}
                {this.renderGapStrategy()}
                {gapStrategy.value === 'EXTRAPOLATE' && this.renderExtrapolateOptions()}
            </Layout>
        )
    }

    renderHarmonics() {
        const {inputs: {harmonics}} = this.props
        return (
            <Form.Slider
                label={msg('process.ccdcSlice.panel.options.form.harmonics.label')}
                tooltip={msg('process.ccdcSlice.panel.options.form.harmonics.tooltip')}
                input={harmonics}
                multiple={false}
                minValue={0}
                maxValue={3}
                ticks={[0, 1, 2, 3]}
                snap
            />
        )
    }

    renderGapStrategy() {
        const {inputs: {gapStrategy}} = this.props
        return (
            <Form.Buttons
                label={msg('process.ccdcSlice.panel.options.form.gapStrategy.label')}
                tooltip={msg('process.ccdcSlice.panel.options.form.gapStrategy.tooltip')}
                input={gapStrategy}
                multiple={false}
                options={[
                    {
                        value: 'INTERPOLATE',
                        label: msg('process.ccdcSlice.panel.options.form.gapStrategy.interpolate.label'),
                        tooltip: msg('process.ccdcSlice.panel.options.form.gapStrategy.interpolate.tooltip')
                    },
                    {
                        value: 'EXTRAPOLATE',
                        label: msg('process.ccdcSlice.panel.options.form.gapStrategy.extrapolate.label'),
                        tooltip: msg('process.ccdcSlice.panel.options.form.gapStrategy.extrapolate.tooltip')
                    },
                    {
                        value: 'MASK',
                        label: msg('process.ccdcSlice.panel.options.form.gapStrategy.mask.label'),
                        tooltip: msg('process.ccdcSlice.panel.options.form.gapStrategy.mask.tooltip')
                    }
                ]}
            />
        )
    }

    renderExtrapolateOptions() {
        const {inputs: {extrapolateSegment, extrapolateMaxDays}} = this.props
        return (
            <React.Fragment>
                <Form.Buttons
                    label={msg('process.ccdcSlice.panel.options.form.extrapolateSegment.label')}
                    input={extrapolateSegment}
                    multiple={false}
                    options={[
                        {
                            value: 'CLOSEST',
                            label: msg('process.ccdcSlice.panel.options.form.extrapolateSegment.closest.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.extrapolateSegment.closest.tooltip')
                        },
                        {
                            value: 'PREVIOUS',
                            label: msg('process.ccdcSlice.panel.options.form.extrapolateSegment.previous.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.extrapolateSegment.previous.tooltip')
                        },
                        {
                            value: 'NEXT',
                            label: msg('process.ccdcSlice.panel.options.form.extrapolateSegment.next.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.extrapolateSegment.next.tooltip')
                        }
                    ]}
                />
                <Form.Slider
                    label={msg('process.ccdcSlice.panel.options.form.extrapolateMaxDays.label')}
                    input={extrapolateMaxDays}
                    multiple={false}
                    minValue={1}
                    ticks={[1, 3, 7, 14, 30, 60, 90, 180, 365, {
                        value: 800,
                        label: msg('process.ccdcSlice.panel.options.form.extrapolateMaxDays.unlimited')
                    }]}
                    snap
                    scale={'log'}
                />
            </React.Fragment>
        )
    }

}

Options.propTypes = {}


export default compose(
    Options,
    recipeFormPanel({id: 'options', fields})
)
