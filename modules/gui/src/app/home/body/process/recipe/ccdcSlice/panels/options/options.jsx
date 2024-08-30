import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './options.module.css'

const EXTRAPOLATE_MAX_DAYS = 800

const fields = {
    harmonics: new Form.Field(),
    gapStrategy: new Form.Field(),
    extrapolateSegment: new Form.Field(),
    extrapolateMaxDays: new Form.Field(),
    breakAnalysisBand: new Form.Field(),
    skipBreakInLastSegment: new Form.Field()
        .notNil(),
    breakMagnitudeDirection: new Form.Field(),
    minBreakConfidence: new Form.Field(),
    breakSelection: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    dateType: selectFrom(recipe, 'model.date.dateType'),
    baseBands: selectFrom(recipe, 'model.source.baseBands')
})

class _Options extends React.Component {
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
        const {dateType, inputs: {gapStrategy}} = this.props
        return (
            <Layout>
                {this.renderHarmonics()}
                {dateType !== 'RANGE' ? this.renderGapStrategy() : null}
                {gapStrategy.value === 'EXTRAPOLATE' && this.renderExtrapolateOptions()}
                {dateType === 'RANGE' ? this.renderBreakOptions() : null}
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
                        value: EXTRAPOLATE_MAX_DAYS,
                        label: msg('process.ccdcSlice.panel.options.form.extrapolateMaxDays.unlimited')
                    }]}
                    snap
                    scale={'log'}
                />
            </React.Fragment>
        )
    }

    renderBreakOptions() {
        const {baseBands, inputs: {breakAnalysisBand, breakMagnitudeDirection, minBreakConfidence, breakSelection, skipBreakInLastSegment}} = this.props
        const bandOptions = baseBands.map(({name}) => ({
            value: name,
            label: name
        }))
        return (
            <React.Fragment>
                <Form.Combo
                    label={msg('process.ccdcSlice.panel.options.form.breakAnalysisBand.label')}
                    placeholder={msg('process.ccdcSlice.panel.options.form.breakAnalysisBand.placeholder')}
                    tooltip={msg('process.ccdcSlice.panel.options.form.breakAnalysisBand.tooltip')}
                    input={breakAnalysisBand}
                    allowClear
                    disabled={!bandOptions.length}
                    options={bandOptions}
                />
                <Form.Buttons
                    label={msg('process.ccdcSlice.panel.options.form.skipBreakInLastSegment.label')}
                    tooltip={msg('process.ccdcSlice.panel.options.form.skipBreakInLastSegment.tooltip')}
                    input={skipBreakInLastSegment}
                    options={[
                        {
                            value: false,
                            label: msg('process.ccdcSlice.panel.options.form.skipBreakInLastSegment.options.INCLUDE')
                        },
                        {
                            value: true,
                            label: msg('process.ccdcSlice.panel.options.form.skipBreakInLastSegment.options.EXCLUDE')
                        }
                    ]}
                />
                <Form.Buttons
                    label={msg('process.ccdcSlice.panel.options.form.breakSelection.label')}
                    tooltip={msg('process.ccdcSlice.panel.options.form.breakSelection.tooltip')}
                    input={breakSelection}
                    options={[
                        {
                            value: 'FIRST',
                            label: msg('process.ccdcSlice.panel.options.form.breakSelection.options.FIRST.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakSelection.options.FIRST.tooltip')
                        },
                        {
                            value: 'LAST',
                            label: msg('process.ccdcSlice.panel.options.form.breakSelection.options.LAST.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakSelection.options.LAST.tooltip')
                        },
                        {
                            value: 'MAGNITUDE',
                            label: msg('process.ccdcSlice.panel.options.form.breakSelection.options.MAGNITUDE.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakSelection.options.MAGNITUDE.tooltip'),
                            disabled: !breakAnalysisBand.value
                        },
                        {
                            value: 'CONFIDENCE',
                            label: msg('process.ccdcSlice.panel.options.form.breakSelection.options.CONFIDENCE.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakSelection.options.CONFIDENCE.tooltip'),
                            disabled: !breakAnalysisBand.value
                        }
                    ]}
                />
                <Form.Buttons
                    label={msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.label')}
                    tooltip={msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.tooltip')}
                    input={breakMagnitudeDirection}
                    disabled={!breakAnalysisBand.value}
                    options={[
                        {
                            value: 'ANY',
                            label: msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.options.ANY.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.options.ANY.tooltip')
                        },
                        {
                            value: 'DECREASE',
                            label: msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.options.DECREASE.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.options.DECREASE.tooltip')
                        },
                        {
                            value: 'INCREASE',
                            label: msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.options.INCREASE.label'),
                            tooltip: msg('process.ccdcSlice.panel.options.form.breakMagnitudeDirection.options.INCREASE.tooltip')
                        }
                    ]}
                />
                <Form.Slider
                    label={msg('process.ccdcSlice.panel.options.form.minBreakConfidence.label')}
                    tooltip={msg('process.ccdcSlice.panel.options.form.minBreakConfidence.tooltip')}
                    input={minBreakConfidence}
                    minValue={0}
                    maxValue={50}
                    decimals={1}
                    ticks={[0, 1, 3, 5, 10, 20, 50]}
                    scale='log'
                    info={value => msg('process.ccdcSlice.panel.options.form.minBreakConfidence.value', {value})}
                    disabled={!breakAnalysisBand.value}
                />
            </React.Fragment>
        )
    }
}

const valuesToModel = values => ({
    ...values,
    extrapolateMaxDays: values.extrapolateMaxDays > 365 ? Number.MAX_SAFE_INTEGER : values.extrapolateMaxDays
})

const modelToValues = model => {
    return ({
        ...model,
        extrapolateMaxDays: model.extrapolateMaxDays > 365 ? EXTRAPOLATE_MAX_DAYS : model.extrapolateMaxDays,
        skipBreakInLastSegment: !model.skipBreakInLastSegment ? false : model.skipBreakInLastSegment,
        breakMagnitudeDirection: model.breakMagnitudeDirection || 'ANY',
        minBreakConfidence: model.minBreakConfidence || 0,
        breakSelection: model.breakSelection || 'FIRST',
    })
}

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'options', fields, mapRecipeToProps, valuesToModel, modelToValues})
)

Options.propTypes = {}
