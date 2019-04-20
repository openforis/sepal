import {ErrorMessage} from 'widget/form'
import {connect} from 'store'
import {fromEvent} from 'rxjs'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import FloatingBox from 'widget/floatingBox'
import Keybinding from 'widget/keybinding'
import Label from 'widget/label'
import List from 'widget/list'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import escapeStringRegexp from 'escape-string-regexp'
import styles from './combo.module.css'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class Combo extends React.Component {
    subscriptions = []
    input = React.createRef()
    list = React.createRef()
    state = {
        showOptions: false,
        filter: '',
        filteredOptions: [],
        flattenedOptions: [],
        selectedOption: null
    }

    render() {
        const {standalone, disabled, className} = this.props
        const {showOptions} = this.state
        const onClick = () =>
            standalone
                ? null
                : showOptions
                    ? this.hideOptions()
                    : disabled
                        ? null
                        : this.showOptions()
        return (
            <div className={[styles.container, className].join(' ')}>
                {this.renderLabel()}
                <div
                    ref={this.input}
                    onClick={onClick}>
                    {this.renderInput()}
                </div>
                {this.renderError()}
                {showOptions ? this.renderOptions() : null}
            </div>
        )
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    renderError() {
        const {input, errorMessage} = this.props
        return <ErrorMessage for={input.name || errorMessage} tabIndex={-1}/>
    }

    renderInput() {
        const {placeholder, autoFocus, disabled, busy, standalone, inputClassName, onCancel} = this.props
        const {filter, selectedOption} = this.state
        const keymap = {
            Escape: onCancel ? onCancel : null,
            ArrowUp: disabled ? null : () => this.showOptions(),
            ArrowDown: disabled ? null : () => this.showOptions(),
        }
        return (
            <Keybinding
                disabled={disabled}
                keymap={keymap}>
                <input
                    className={[
                        standalone ? styles.standalone : null,
                        selectedOption && !standalone ? styles.fakePlaceholder : null,
                        inputClassName
                    ].join(' ')}
                    type='search'
                    value={filter}
                    placeholder={selectedOption && !standalone ? selectedOption.label : placeholder}
                    autoFocus={autoFocus}
                    disabled={disabled || busy || isMobile()}
                    onChange={e => this.setFilter(e.target.value)}/>
            </Keybinding>
        )
    }

    renderOptions() {
        const {placement = 'below', optionsClassName} = this.props
        const {flattenedOptions, selectedOption} = this.state
        return (
            <FloatingBox
                ref={this.list}
                element={this.input.current}
                placement={placement}>
                <List
                    className={optionsClassName}
                    options={flattenedOptions}
                    selectedOption={selectedOption}
                    onSelect={option => this.selectOption(option)}
                    onCancel={() => this.resetFilter()}
                />
            </FloatingBox>
        )
    }

    showOptions() {
        this.setState({showOptions: true})
    }

    hideOptions() {
        this.setState({showOptions: false})
    }

    setFilter(filter = '') {
        const {standalone} = this.props
        this.setState({
            showOptions: !!filter || standalone,
            filter
        }, this.updateOptions)
    }

    resetFilter() {
        const {onCancel, standalone} = this.props
        const {filter} = this.state
        if (standalone && onCancel && !filter) {
            onCancel()
        } else {
            this.setFilter()
        }
    }

    selectOption(option) {
        const {input, onChange} = this.props
        this.setSelectedOption(option)
        this.setFilter()
        input.set(option.value)
        onChange && onChange(option)
    }

    setSelectedOption(selectedOption) {
        this.updateState({selectedOption})
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

    handleBlurEvents() {
        const {onCancel} = this.props
        const click$ = fromEvent(document, 'click')
        const isInputClick = e => this.input.current && this.input.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains(e.target)
        this.subscriptions.push(
            click$.subscribe(e => {
                if (!isInputClick(e) && !isListClick(e)) {
                    this.setFilter()
                    onCancel && onCancel(e)
                }
            })
        )
    }

    componentDidMount() {
        this.setFilter()
        this.handleBlurEvents()
    }

    componentDidUpdate() {
        this.updateOptions()
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }

    matcher(filter) {
        // match beginning of multiple words in order (e.g. "u k" matches "United Kingdom")
        return RegExp(filter.split(/\s/).map(part => '\\b' + escapeStringRegexp(part)).join('.*'), 'i')
    }

    updateOptions() {
        const {input, options} = this.props
        const {filter} = this.state
        const matcher = this.matcher(filter)
        const getFilteredOptions = options =>
            _.compact(
                options.map(option =>
                    option.options
                        ? {...option, options: getFilteredOptions(option.options)}
                        : matcher.test(option.searchableText || option.label)
                            ? option
                            : null
                )
            )
        const getFlattenedOptions = options =>
            _.flatten(
                options.map(option =>
                    option.options
                        ? [{label: option.label, group: true}, ...option.options]
                        : option
                )
            )
        const filteredOptions = getFilteredOptions(options)
        const flattenedOptions = getFlattenedOptions(filteredOptions)

        const getInputOption = () =>
            input && flattenedOptions && flattenedOptions.find(option => option.value === input.value)

        const getSelectedOption = selectedOption => {
            const validatedSelectedOption = selectedOption && flattenedOptions.find(option => option.value === selectedOption.value)
            return validatedSelectedOption || getInputOption()
        }
            
        this.updateState(prevState => ({
            filteredOptions,
            flattenedOptions,
            selectedOption: getSelectedOption.bind(this)(prevState.selectedOption)
        }))
    }
}

export default connect(mapStateToProps)(Combo)

Combo.propTypes = {
    input: PropTypes.any.isRequired,
    options: PropTypes.any.isRequired,
    autoFocus: PropTypes.any,
    busy: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    inputClassName: PropTypes.string,
    label: PropTypes.string,
    optionsClassName: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    standalone: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    onCancel:  PropTypes.func,
    onChange:  PropTypes.func
}
