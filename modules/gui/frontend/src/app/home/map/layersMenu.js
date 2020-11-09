import {Form, form} from 'widget/form/form'
// import {Menu} from './menu'
import {Menu} from 'widget/menu/menu'
import {activatable} from 'widget/activation/activatable'
import {changeBaseLayer} from './baseLayer'
import {compose} from 'compose'
import {msg} from 'translate'
import {select} from 'store'
import ButtonSelect from 'widget/buttonSelect'
import Labels from './labels'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from '../../../action-builder'
// import moment from 'moment'
import styles from './layersMenu.module.css'

const fields = {
    // year: new Form.Field(),
    // month: new Form.Field(),
    dateRange: new Form.Field(),
    proc: new Form.Field()
}

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    baseLayer: select([ownProps.statePath, 'baseLayer']),
    overlayIndex: select([ownProps.statePath, 'overlayIndex']),
    dateRange: select([ownProps.statePath, 'mapLayer.dateRange']),
    proc: select([ownProps.statePath, 'mapLayer.proc'])
    // year: select([ownProps.statePath, 'options.year']),
    // month: select([ownProps.statePath, 'options.month'])
})

class _LayersMenu extends React.Component {

    getPlanetDateOptions() {
        // const {inputs: {year}} = this.props
        // const startDate = moment('2018-08-01')
        // const endDate = moment().subtract(1, 'months')
        //
        // const yearOptions = sequence(startDate.year(), moment().year())
        //     .map(year => ({value: `${year}`, label: `${year}`}))
        //
        // const allMonthOptions = moment.monthsShort()
        //     .map((label, i) => ({value: `${i + 1}`.padStart(2, '0'), label}))
        //
        // const monthOptions = year.value === `${startDate.year()}`
        //     ? allMonthOptions.slice(startDate.month() + 1)
        //     : year.value === `${endDate.year()}`
        //         ? allMonthOptions.slice(0, endDate.month() + 1)
        //         : allMonthOptions
        // return {yearOptions, monthOptions}

        const procOptions = [
            {value: 'rgb', label: 'RGB'},
            {value: 'cir', label: 'CIR'},
        ]
        const dateRangeOptions = [
            {value: '2018-12_2019-05', label: 'Dec 2018 (6 months)'},
            {value: '2019-06_2019-11', label: 'Jun 2019 (6 months)'},
            {value: '2019-12_2020-05', label: 'Dec 2019 (6 months)'},
            {value: '2020-06_2020-08', label: 'Jun 2020 (3 months)'},
            {value: '2020-09', label: 'Sep 2020 (1 month)'},
        ]
        return {procOptions, dateRangeOptions}
    }

    toggleOverlay = selectedOverlayIndex => {
        const {mapContext: {sepalMap, googleMap}, statePath} = this.props
        const overlays = sepalMap.toggleableLayers()

        const prevOverlayIndex = this.selectedOverlayIndex()
        if (selectedOverlayIndex !== prevOverlayIndex) {
            const prevOverlay = overlays.find(layer => layer.layerIndex === prevOverlayIndex)
            prevOverlay && prevOverlay.hide(googleMap, true)
        }

        const selectedOverlay = overlays.find(layer => layer.layerIndex === selectedOverlayIndex)
        const hide = prevOverlayIndex === selectedOverlayIndex
        selectedOverlay && selectedOverlay.hide(googleMap, hide)
        const nextOverlayIndex = hide ? -1 : selectedOverlayIndex

        actionBuilder('SET_OVERLAY', {nextOverlayIndex})
            .set([statePath, 'overlayIndex'], nextOverlayIndex)
            .build()
            .dispatch()
    }

    // changeBaseLayer(type, year, month, proc) {
    changeBaseLayer(type, dateRange, proc) {
        // console.log('changeBaseLayer', dateRange.value, proc.value)
        const {statePath, mapContext} = this.props
        const planetApiKey = mapContext.norwayPlanetApiKey
        changeBaseLayer({
            type,
            mapContext,
            statePath,
            options: {dateRange: dateRange.value, proc: proc.value, planetApiKey}
            // options: {year: year.value, month: month.value, proc: proc.value, planetApiKey}
        })
    }

    selectedOverlayIndex() {
        const {overlayIndex, mapContext: {sepalMap}} = this.props
        if (overlayIndex === undefined) {
            const overlays = sepalMap.toggleableLayers()
            const firstOverlayIndex = overlays.length
                ? overlays.map(layer => layer.layerIndex)[0]
                : -1
            return firstOverlayIndex
        } else {
            return overlayIndex
        }
    }

    render() {
        const {
            inputs: {dateRange, proc},
            // inputs: {year, month, proc},
            activatable: {deactivate},
            labelsShown, baseLayer, labelLayerIndex, statePath, mapContext
        } = this.props
        const overlays = mapContext.sepalMap.toggleableLayers()
        const toggleableOptions = overlays.map(layer =>
            <Menu.Option
                key={layer.layerIndex}
                id={layer.layerIndex}
                label={layer.label}
                description={layer.description}/>)
        // const {yearOptions, monthOptions, procOptions} = this.getPlanetDateOptions()
        const {dateRangeOptions, procOptions} = this.getPlanetDateOptions()

        const procOption = procOptions.find(({value}) => proc.value === value)
        const dateRangeOption = dateRangeOptions.find(({value}) => dateRange.value === value)
        // const yearOption = yearOptions.find(({value}) => year.value === value)
        // const monthOption = monthOptions.find(({value}) => month.value === value)
        return (
            <Menu
                position='top-right'
                className={styles.panel}
                close={deactivate}>
                <Menu.Select
                    id={'BASE_LAYER'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.baseLayer')}
                    onSelect={type => this.changeBaseLayer(type, dateRange, proc)}
                    // onSelect={type => this.changeBaseLayer(type, year, month, proc)}
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
                                    input={proc}
                                    tooltipPlacement='bottom'
                                    options={procOptions}
                                    label={procOption && procOption.label}
                                    onSelect={proc => this.changeBaseLayer('PLANET', this.props.inputs.dateRange, proc)}
                                    // onSelect={proc => this.changeBaseLayer('PLANET', this.props.inputs.year, this.props.inputs.month, proc)}
                                />
                                <ButtonSelect
                                    placement='below'
                                    alignment='left'
                                    input={dateRange}
                                    tooltipPlacement='bottom'
                                    options={dateRangeOptions}
                                    label={dateRangeOption && dateRangeOption.label}
                                    onSelect={dateRange => this.changeBaseLayer('PLANET', dateRange, this.props.inputs.proc)}
                                />
                                {/*<ButtonSelect*/}
                                {/*    placement='below'*/}
                                {/*    alignment='left'*/}
                                {/*    input={year}*/}
                                {/*    tooltipPlacement='bottom'*/}
                                {/*    options={yearOptions}*/}
                                {/*    label={yearOption && yearOption.label}*/}
                                {/*    onSelect={year => this.changeBaseLayer('PLANET', year, this.props.inputs.month, this.props.inputs.proc)}*/}
                                {/*/>*/}
                                {/*<ButtonSelect*/}
                                {/*    placement='below'*/}
                                {/*    alignment='left'*/}
                                {/*    input={month}*/}
                                {/*    tooltipPlacement='bottom'*/}
                                {/*    options={monthOptions}*/}
                                {/*    label={monthOption && monthOption.label}*/}
                                {/*    onSelect={month => this.changeBaseLayer('PLANET', this.props.inputs.year, month, this.props.inputs.proc)}*/}
                                {/*/>*/}
                            </div>
                        }/>
                </Menu.Select>
                <Menu.Separator/>
                <Menu.Select
                    id={'OVERLAYS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.overlay')}
                    onSelect={selectedOverlayIndex => this.toggleOverlay(selectedOverlayIndex)}
                    selected={this.selectedOverlayIndex()}>
                    {toggleableOptions}
                </Menu.Select>
                <Menu.Toggle
                    id={'SHOW_LABELS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.labels.label')}
                    description={msg('process.mosaic.mapToolbar.layersMenu.labels.description')}
                    selected={labelsShown}
                    onChange={shown =>
                        Labels.showLabelsAction({
                            mapContext,
                            shown,
                            layerIndex: labelLayerIndex,
                            statePath
                        }).dispatch()}/>
            </Menu>
        )
    }

    componentDidUpdate() {
        // const {inputs: {year, month, proc}} = this.props
        // if (!year.value)
        // year.set(this.props.year || moment().format('YYYY'))
        // if (!month.value)
        // month.set(this.props.month || moment().subtract(1, 'months').format('MM'))
        // else {
        // const {monthOptions} = this.getPlanetDateOptions()
        // if (!monthOptions.find(({value}) => month.value === value)) {
        //     const monthOption = monthOptions[0]
        //     month.set(monthOption.value)
        //     this.changeBaseLayer('PLANET', year, monthOption, )
        // }
        // }
        const {dateRange: prevDateRange, proc: prevProc, inputs: {dateRange, proc}} = this.props
        // console.log(dateRange.value, proc.value)
        if (!proc.value)
            proc.set(prevProc || 'rgb')
        if (!dateRange.value)
            dateRange.set(prevDateRange || '2020-09')
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

// const sequence = (start, end, step = 1) =>
//     Array.apply(null, {length: Math.floor((end - start) / step) + 1})
//         .map((_, i) => i * step + start)

LayersMenu.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    mapContext: PropTypes.object.isRequired,
    statePath: PropTypes.any.isRequired
}
