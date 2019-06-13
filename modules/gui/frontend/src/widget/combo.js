import {FormComponent} from 'widget/form'
import {Subject, fromEvent} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {delay} from 'rxjs/operators'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import AutoFocus from 'widget/autoFocus'
import FloatingBox from 'widget/floatingBox'
import Keybinding from 'widget/keybinding'
import List from 'widget/list'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import escapeStringRegexp from 'escape-string-regexp'
import styles from './combo.module.css'
import withSubscriptions from 'subscription'

const SELECTION_DELAY_MS = 350

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class Combo extends React.Component {
    inputContainer = React.createRef()
    input = React.createRef()
    list = React.createRef()
    select$ = new Subject()
    state = {
        showOptions: false,
        filter: '',
        filteredOptions: [],
        flattenedOptions: [],
        selectedOption: null,
        selected: false,
        focused: false
    }

    render() {
        const {input, errorMessage, standalone, disabled, className, onCancel} = this.props
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        const {showOptions} = this.state
        const onClick = e =>
            standalone
                ? onCancel && onCancel(e)
                : showOptions
                    ? this.hideOptions()
                    : disabled
                        ? null
                        : this.showOptions()
        return (
            <FormComponent
                className={[styles.container, className].join(' ')}
                input={input}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                errorMessage={errorMessage}>
                <div
                    ref={this.inputContainer}
                    onClick={onClick}>
                    {this.renderInput()}
                </div>
                {showOptions ? this.renderOptions() : null}
            </FormComponent>
        )
    }

    renderInput() {
        const {placeholder, autoFocus, disabled, busy, standalone, inputClassName, input} = this.props
        const {focused, filter, selectedOption, showOptions} = this.state
        const showOptionsKeyBinding = showOptions ? undefined : () => this.showOptions()
        const keymap = {
            ArrowUp: showOptionsKeyBinding,
            ArrowDown: showOptionsKeyBinding,
            ArrowLeft: showOptionsKeyBinding,
            ArrowRight: showOptionsKeyBinding,
            Home: showOptionsKeyBinding,
            End: showOptionsKeyBinding,
            Escape: !showOptions ? undefined : () => this.hideOptions(),
        }
        return (
            <Keybinding
                disabled={disabled || !focused}
                keymap={keymap}>
                <input
                    ref={this.input}
                    className={[
                        standalone ? styles.standalone : null,
                        selectedOption && !standalone ? styles.fakePlaceholder : null,
                        inputClassName
                    ].join(' ')}
                    type='search'
                    value={filter}
                    placeholder={selectedOption && !standalone ? selectedOption.label : placeholder}
                    disabled={disabled || busy}
                    readOnly={isMobile()}
                    onChange={e => this.setFilter(e.target.value)}
                    onFocus={() => this.setState({focused: true})}
                    onBlur={() => {
                        input.validate()
                        this.setState({focused: false})
                    }}
                />
                <AutoFocus ref={this.input} enabled={autoFocus}/>
            </Keybinding>
        )
    }

    renderOptions() {
        const {placement = 'below', optionsClassName, optionTooltipPlacement, alignment} = this.props
        const {flattenedOptions, selectedOption, selected} = this.state
        return (
            <FloatingBox
                element={this.inputContainer.current}
                placement={placement}>
                <List
                    ref={this.list}
                    className={optionsClassName || styles.options}
                    options={flattenedOptions}
                    selectedOption={selectedOption}
                    onSelect={option => this.select$.next(option)}
                    onCancel={() => this.resetFilter()}
                    autoCenter={!selected}
                    tooltipPlacement={optionTooltipPlacement}
                    autoHighlight
                    keyboard
                    alignment={alignment}
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
        const {input, onChange, addSubscription} = this.props
        addSubscription(
            this.select$.subscribe(
                option => {
                    this.setSelectedOption(option)
                    input.set(option.value)
                    onChange && onChange(option)
                }
            ),
            this.select$.pipe(
                delay(SELECTION_DELAY_MS)
            ).subscribe(
                () => this.setState({selected: false}, this.setFilter)
            )
        )
    }

    handleBlur() {
        const {onCancel, addSubscription} = this.props
        const click$ = fromEvent(document, 'click')
        const isInputClick = e => this.inputContainer.current && this.inputContainer.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains && this.list.current.contains(e.target)
        addSubscription(
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
        this.handleSelect()
        this.handleBlur()
    }

    shouldComponentUpdate() {
        return !this.state.selected
    }

    componentDidUpdate() {
        this.updateOptions()
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

export default compose(
    Combo,
    withSubscriptions(),
    connect(mapStateToProps)
)

Combo.propTypes = {
    input: PropTypes.any.isRequired,
    options: PropTypes.any.isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    autoFocus: PropTypes.any,
    busy: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.string,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    standalone: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    onCancel: PropTypes.func,
    onChange: PropTypes.func
}
