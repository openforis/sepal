import {compose} from 'compose'
import {activatable} from 'widget/activation/activatable'
import React from 'react'
import styles from './layersMenu.module.css'
import Labels from './labels'
import {Menu} from './menu'
import {select} from 'store'
import PropTypes from 'prop-types'
import {changeBaseLayer} from './baseLayer'
import {msg} from 'translate'
import ButtonSelect from 'widget/buttonSelect'
import {Form, form} from 'widget/form/form'
import moment from 'moment'
import {getNorwayPlanetApiKey} from './map'

const fields = {
    year: new Form.Field(),
    month: new Form.Field()
}

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    baseLayer: select([ownProps.statePath, 'baseLayer']),
    year: select([ownProps.statePath, 'options.year']),
    month: select([ownProps.statePath, 'options.month'])
})

class _LayersMenu extends React.Component {

    getPlanetDateOptions() {
        const {inputs: {year}} = this.props
        const startDate = moment('2018-08-01')
        const endDate = moment().subtract(1, 'months')

        const yearOptions = sequence(startDate.year(), moment().year())
            .map(year => ({value: `${year}`, label: `${year}`}))

        const allMonthOptions = moment.monthsShort()
            .map((label, i) => ({value: `${i + 1}`.padStart(2, '0'), label}))

        const monthOptions = year.value === `${startDate.year()}`
            ? allMonthOptions.slice(startDate.month() + 1)
            : year.value === `${endDate.year()}`
                ? allMonthOptions.slice(0, endDate.month() + 1)
                : allMonthOptions
        return {yearOptions, monthOptions}
    }

    changeLayer(type, year, month) {
        const {statePath, mapContext} = this.props
        const planetApiKey = getNorwayPlanetApiKey()
        changeBaseLayer({
            type,
            mapContext,
            statePath,
            options: {year: year.value, month: month.value, planetApiKey}
        })
    }


    render() {
        const {inputs: {year, month}, activatable: {deactivate}, labelsShown, baseLayer, labelLayerIndex, statePath, mapContext} = this.props


        const {yearOptions, monthOptions} = this.getPlanetDateOptions()

        const yearOption = yearOptions.find(({value}) => year.value === value)
        const monthOption = monthOptions.find(({value}) => month.value === value)
        return (
            <Menu
                position='top-right'
                className={styles.panel}
                close={deactivate}>
                <Menu.Select
                    id={'BASE_LAYER'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.baseLayer')}
                    onSelect={type => this.changeLayer(type, year, month)}
                    selected={baseLayer || 'SEPAL'}>
                    <Menu.Option
                        id={'SEPAL'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.SEPAL.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.SEPAL.description')}/>
                    <Menu.Option
                        id={'GOOGLE_SATELLITE'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.GOOGLE_SATELLITE.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.GOOGLE_SATELLITE.description')}/>
                    <Menu.Option
                        id={'PLANET'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.PLANET.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.PLANET.description')}
                        right={
                            <div className={styles.layerOptions}>
                                <ButtonSelect
                                    placement='below'
                                    alignment='left'
                                    input={year}
                                    tooltipPlacement='bottom'
                                    options={yearOptions}
                                    label={yearOption && yearOption.label}
                                    onSelect={year => this.changeLayer('PLANET', year, this.props.inputs.month)}
                                />
                                <ButtonSelect
                                    placement='below'
                                    alignment='left'
                                    input={month}
                                    tooltipPlacement='bottom'
                                    options={monthOptions}
                                    label={monthOption && monthOption.label}
                                    onSelect={month => this.changeLayer('PLANET', this.props.inputs.year, month)}
                                />
                            </div>
                        }/>
                </Menu.Select>
                <Menu.Separator/>
                <Menu.Toggle
                    id={'SHOW_LABELS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.labels.label')}
                    description={msg('process.mosaic.mapToolbar.layersMenu.labels.description')}
                    selected={labelsShown}
                    onChange={shown =>
                        Labels.showLabelsAction({
                            shown,
                            layerIndex: labelLayerIndex,
                            statePath,
                            mapContext
                        }).dispatch()}/>
            </Menu>
        )
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {inputs: {year, month}} = this.props
        if (!year.value)
            year.set(this.props.year || moment().format('YYYY'))
        if (!month.value)
            month.set(this.props.month || moment().subtract(1, 'months').format('MM'))
        else {
            const {monthOptions} = this.getPlanetDateOptions()
            if (!monthOptions.find(({value}) => month.value === value)) {
                const monthOption = monthOptions[0]
                month.set(monthOption.value)
                this.changeLayer('PLANET', year, monthOption)
            }
        }
    }
}

const policy = () => ({
    _: 'allow'
})
export const LayersMenu = compose(
    _LayersMenu,
    form({fields, mapStateToProps}),
    activatable({id: 'layersMenu', policy})
)

const sequence = (start, end, step = 1) =>
    Array.apply(null, {length: Math.floor((end - start) / step) + 1})
        .map((_, i) => i * step + start)


LayersMenu.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    mapContext: PropTypes.string.isRequired,
    statePath: PropTypes.any.isRequired
}