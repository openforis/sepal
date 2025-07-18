import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {asFunctionalComponent} from '~/classComponent'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {Button} from '~/widget/button'
import {FloatingBox} from '~/widget/floatingBox'
import {Icon} from '~/widget/icon'
import {ScrollableList} from '~/widget/list'

import {ButtonGroup} from './buttonGroup'
import styles from './buttonSelect.module.css'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class _ButtonSelect extends React.Component {
    input = React.createRef()
    list = React.createRef()
    select$ = new Subject()
    state = {
        showOptions: false,
        flattenedOptions: [],
        selectedOption: null,
        selected: false
    }

    constructor(props) {
        super(props)
        this.handleBlur = this.handleBlur.bind(this)
        this.toggleOptions = this.toggleOptions.bind(this)
        this.hideOptions = this.hideOptions.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onSelect = this.onSelect.bind(this)
    }

    render() {
        const {className} = this.props
        const {showOptions} = this.state
        return (
            <div className={[styles.container, className].join(' ')}>
                {this.renderButton()}
                {showOptions ? this.renderOptions() : null}
            </div>
        )
    }

    renderButton() {
        const {onClick} = this.props
        return onClick
            ? this.renderMultiButton()
            : this.renderSingleButton()
    }

    renderSingleButton() {
        const {noChevron, disabled, chromeless, shape, look, icon, labelStyle, tooltip, tooltipPlacement, width, onMouseOver, onMouseOut} = this.props
        return (
            <Button
                ref={this.input}
                chromeless={chromeless}
                shape={shape}
                look={look}
                icon={icon}
                label={this.getLabel()}
                labelStyle={labelStyle}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                width={width}
                disabled={disabled}
                tail={
                    noChevron ? null : <Icon name={this.getChevronIcon()}/>
                }
                onClick={this.toggleOptions}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
            />
        )
    }

    renderMultiButton() {
        const {disabled, chromeless, shape, look, icon, labelStyle, tooltip, tooltipPlacement, width, onMouseOver, onMouseOut} = this.props
        return (
            <ButtonGroup
                ref={this.input}
                spacing='none'
                layout='horizontal-nowrap'
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
            >
                <Button
                    chromeless={chromeless}
                    shape={shape}
                    look={look}
                    icon={icon}
                    label={this.getLabel()}
                    labelStyle={labelStyle}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    width={width}
                    disabled={disabled}
                    onClick={this.onClick}
                />
                <Button
                    chromeless={chromeless}
                    shape={shape}
                    look={look}
                    icon={this.getChevronIcon()}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={disabled}
                    onClick={this.toggleOptions}
                />
            </ButtonGroup>
        )
    }

    onClick(e) {
        const {onClick} = this.props
        onClick && onClick(e)
    }
    
    getLabel() {
        const {label} = this.props
        const {selectedOption} = this.state
        return (selectedOption && (selectedOption.buttonLabel || selectedOption.label)) || label
    }
    getChevron() {
    }

    getChevronIcon() {
        const {noChevron, placement} = this.props
        return noChevron
            ? null
            : placement === 'above' ? 'chevron-up' : 'chevron-down'
    }

    renderOptions() {
        const {placement, hPlacement = 'over-right', optionsClassName, optionTooltipPlacement} = this.props
        const {flattenedOptions, selectedOption, selected} = this.state
        return (
            <FloatingBox
                element={this.input.current}
                vPlacement={placement}
                hPlacement={hPlacement}
                onBlur={this.handleBlur}>
                <ScrollableList
                    ref={this.list}
                    className={optionsClassName || styles.options}
                    options={flattenedOptions}
                    selectedValue={selectedOption?.value}
                    onSelect={this.onSelect}
                    onCancel={this.hideOptions}
                    autoCenter={!selected}
                    tooltipPlacement={optionTooltipPlacement}
                    air='more'
                    keyboard
                />
            </FloatingBox>
        )
    }

    onSelect(option) {
        this.select$.next(option)
    }

    toggleOptions() {
        const {showOptions} = this.state
        showOptions
            ? this.hideOptions()
            : this.showOptions()
    }

    showOptions() {
        this.setState({showOptions: true})
    }

    hideOptions() {
        this.setState({showOptions: false, selectedOption: null})
    }

    setSelectedOption(selectedOption) {
        this.updateState({
            selectedOption,
            selected: true
        })
    }

    updateState(state, callback) {
        const updatedState = (prevState, state) =>
            _.isEqual(_.pick(prevState, _.keys(state)), state) ? null : state
        this.setState(
            prevState =>
                updatedState(prevState, _.isFunction(state) ? state(prevState) : state),
            callback
        )
    }

    handleSelect() {
        const {input, onSelect, addSubscription} = this.props
        addSubscription(
            this.select$.subscribe(
                option => {
                    this.setState({selected: false}, this.hideOptions)
                    this.setSelectedOption(option)
                    input && input.set(option.value)
                    onSelect && onSelect(option)
                }
            )
        )
    }

    handleBlur(e) {
        const isInputClick = e => this.input.current && this.input.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains && this.list.current.contains(e.target)
        if (!isInputClick(e) && !isListClick(e)) {
            this.hideOptions()
        }
    }

    componentDidMount() {
        this.handleSelect()
    }

    static getDerivedStateFromProps(props, state) {
        const {input} = props
        const {flattenedOptions} = state
        return input
            ? {
                selectedOption: _.find(flattenedOptions, option => option.value === input.value)
            }
            : null
    }

    componentDidUpdate() {
        this.updateOptions()
    }

    updateOptions() {
        const {options} = this.props
        const getFlattenedOptions = options =>
            _.flatten(
                options.map(option =>
                    option.options
                        ? [{..._.omit(option, 'options'), group: true}, ...option.options]
                        : option
                )
            )
        this.updateState({
            flattenedOptions: getFlattenedOptions(options)
        })
    }
}

export const ButtonSelect = compose(
    _ButtonSelect,
    withSubscriptions(),
    connect(mapStateToProps),
    asFunctionalComponent({
        placement: 'below'
    })
)

ButtonSelect.propTypes = {
    options: PropTypes.any.isRequired,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    hPlacement: PropTypes.oneOf(['center', 'left', 'over-left', 'over', 'over-right', 'right']),
    icon: PropTypes.string,
    input: PropTypes.any,
    label: PropTypes.any,
    labelStyle: PropTypes.any,
    look: PropTypes.string,
    noChevron: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    shape: PropTypes.string,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    width: PropTypes.string,
    onClick: PropTypes.func,
    onMouseOut: PropTypes.func,
    onMouseOver: PropTypes.func,
    onSelect: PropTypes.func
}
