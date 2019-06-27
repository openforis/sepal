import {Button} from 'widget/button'
import {ScrollableList} from 'widget/list'
import {Subject, fromEvent} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {delay} from 'rxjs/operators'
import {selectFrom} from 'stateUtils'
import FloatingBox from 'widget/floatingBox'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './buttonSelect.module.css'
import withSubscriptions from 'subscription'

const SELECTION_DELAY_MS = 350

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class ButtonSelect extends React.Component {
    input = React.createRef()
    list = React.createRef()
    select$ = new Subject()
    state = {
        showOptions: false,
        flattenedOptions: [],
        selectedOption: null,
        selected: false
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
        const {disabled, chromeless, shape, look, icon, tooltip, tooltipPlacement} = this.props
        return (
            <Button
                ref={this.input}
                chromeless={chromeless}
                shape={shape}
                look={look}
                icon={icon}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                onClick={() => this.toggleOptions()}
                disabled={disabled}
            >
                {this.renderContent()}
            </Button>
        )
    }

    renderContent() {
        const {label, icon} = this.props
        const {selectedOption} = this.state
        return (
            <div className={styles.content}>
                {icon && <Icon name={icon}/>}
                <div>
                    {(selectedOption && selectedOption.buttonLabel) || label}
                </div>
                {this.renderChevron()}
            </div>
        )
    }

    renderChevron() {
        const {placement} = this.props
        return (
            <Icon name={placement === 'above' ? 'chevron-up' : 'chevron-down'}/>
        )
    }

    renderOptions() {
        const {alignment, placement, optionsClassName, optionTooltipPlacement} = this.props
        const {flattenedOptions, selectedOption, selected} = this.state
        return (
            <FloatingBox
                element={this.input.current}
                alignment={alignment}
                placement={placement}
                autoWidth
            >
                <ScrollableList
                    ref={this.list}
                    className={optionsClassName || styles.options}
                    options={flattenedOptions}
                    selectedOption={selectedOption}
                    onSelect={option => this.select$.next(option)}
                    onCancel={() => this.hideOptions()}
                    autoCenter={!selected}
                    tooltipPlacement={optionTooltipPlacement}
                    keyboard
                />
            </FloatingBox>
        )
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
                    this.setSelectedOption(option)
                    input && input.set(option.value)
                    onSelect && onSelect(option)
                }
            ),
            this.select$.pipe(
                delay(SELECTION_DELAY_MS)
            ).subscribe(
                () => this.setState({selected: false}, this.hideOptions)
            )
        )
    }

    handleBlur() {
        const {addSubscription} = this.props
        const click$ = fromEvent(document, 'click')
        const isInputClick = e => this.input.current && this.input.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains && this.list.current.contains(e.target)
        addSubscription(
            click$.subscribe(e => {
                if (!isInputClick(e) && !isListClick(e)) {
                    this.hideOptions()
                }
            })
        )
    }

    componentDidMount() {
        this.handleSelect()
        this.handleBlur()
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
                        ? [{label: option.label, group: true}, ...option.options]
                        : option
                )
            )
        this.updateState({
            flattenedOptions: getFlattenedOptions(options)
        })
    }
}

export default compose(
    ButtonSelect,
    withSubscriptions(),
    connect(mapStateToProps)
)

ButtonSelect.propTypes = {
    options: PropTypes.any.isRequired,
    alignment: PropTypes.oneOf(['left', 'right']),
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    icon: PropTypes.string,
    input: PropTypes.any,
    label: PropTypes.string,
    look: PropTypes.string,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    shape: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    onSelect: PropTypes.func
}

ButtonSelect.defaultProps = {
    alignment: 'left',
    placement: 'below'
}
