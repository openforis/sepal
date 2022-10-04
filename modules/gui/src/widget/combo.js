import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Input} from 'widget/input'
import {ScrollableList} from 'widget/list'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import {simplifyString, splitString} from 'string'
import AutoFocus from 'widget/autoFocus'
import FloatingBox from 'widget/floatingBox'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './combo.module.css'
import withSubscriptions from 'subscription'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class _Combo extends React.Component {
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

    constructor() {
        super()
        this.onInputClick = this.onInputClick.bind(this)
        this.onInputBlur = this.onInputBlur.bind(this)
        this.onOptionsBlur = this.onOptionsBlur.bind(this)
        this.showOptions = this.showOptions.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.resetFilterOrClose = this.resetFilterOrClose.bind(this)
        this.resetFilterOrClearSelection = this.resetFilterOrClearSelection.bind(this)
        this.selectOption = this.selectOption.bind(this)
        this.onOptionSelected = this.onOptionSelected.bind(this)
    }

    isActive() {
        const {disabled} = this.props
        return !disabled
    }

    isFocused() {
        const {focused} = this.state
        return focused
    }

    setFocused(focused) {
        this.setState({focused})
    }

    showOptions() {
        this.setState({showOptions: true})
    }

    hideOptions() {
        const {onCancel} = this.props
        this.setState({showOptions: false}, () => onCancel && onCancel())
    }

    onInputClick() {
        const {autoOpen} = this.props
        const {filter, showOptions} = this.state
        if (this.isActive()) {
            if (!autoOpen && !filter && showOptions) {
                this.hideOptions()
            } else if (!showOptions) {
                this.showOptions()
            }
        }
    }

    render() {
        const {errorMessage, busyMessage, disabled, className, label, labelButtons, tooltip, tooltipPlacement} = this.props
        const {showOptions} = this.state
        return (
            <Form.FieldSet
                className={[styles.container, className].join(' ')}
                label={label}
                labelButtons={labelButtons}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                errorMessage={errorMessage}
                busyMessage={busyMessage}>
                <div
                    ref={this.inputContainer}
                    className={styles.inputContainer}
                    onClick={this.onInputClick}>
                    {this.renderInput()}
                </div>
                {showOptions ? this.renderOptions() : null}
            </Form.FieldSet>
        )
    }

    renderInput() {
        const {placeholder, autoFocus, readOnly, border, value, inputClassName, additionalButtons = []} = this.props
        const {filter, selectedOption, showOptions} = this.state
        return (
            <Keybinding
                disabled={!this.isActive() || !this.isFocused()}
                keymap={{
                    ArrowUp: this.showOptions,
                    ArrowDown: this.showOptions,
                    ArrowLeft: this.showOptions,
                    ArrowRight: this.showOptions,
                    Home: this.showOptions,
                    End: this.showOptions
                }}>
                <AutoFocus element={this.input.current} focusEnabled={autoFocus}>
                    <Input
                        ref={this.input}
                        className={[
                            styles.input,
                            selectedOption && !showOptions ? styles.fakePlaceholder : null,
                            inputClassName
                        ].join(' ')}
                        border={border}
                        value={filter}
                        placeholder={selectedOption && !_.isNil(value) ? selectedOption.label : placeholder}
                        disabled={!this.isActive()}
                        readOnly={readOnly || isMobile()}
                        buttons={[
                            this.renderClearButton(),
                            this.renderToggleOptionsButton()
                        ]}
                        additionalButtons={additionalButtons}
                        onChange={e => this.setFilter(e.target.value)}
                        onFocus={() => this.setFocused(true)}
                        onBlur={this.onInputBlur}
                    />
                </AutoFocus>
            </Keybinding>
        )
    }

    focusInput() {
        this.input.current && this.input.current.focus()
    }

    onInputBlur(e) {
        const {onBlur} = this.props
        const {showOptions} = this.state
        if (showOptions) {
            this.focusInput()
        } else {
            onBlur && onBlur(e)
            this.setFocused(false)
        }
    }

    renderClearButton() {
        const {allowClear} = this.props
        const {filter, selectedOption} = this.state
        const disabled = !filter && (!allowClear || !selectedOption)
        return (
            <Button
                key='clear'
                chromeless
                shape='none'
                air='none'
                icon='times'
                iconAttributes={{
                    fixedWidth: true
                }}
                tabIndex={-1}
                disabled={disabled}
                onClick={this.resetFilterOrClearSelection}
            />
        )
    }

    renderToggleOptionsButton() {
        const {placement} = this.props
        const {showOptions} = this.state
        const icon = {
            below: 'chevron-down',
            above: 'chevron-up'
        }
        return (
            <Button
                key='toggle'
                chromeless
                shape='none'
                air='none'
                icon={icon[placement]}
                iconAttributes={{
                    fixedWidth: true,
                    flip: showOptions ? 'vertical' : null
                }}
                tabIndex={-1}
                disabled={!this.isActive()}
                onClick={() => showOptions ? this.hideOptions() : this.showOptions()}
            />
        )
    }

    renderOptions() {
        const {placement, optionsClassName, optionTooltipPlacement, alignment} = this.props
        const {flattenedOptions, selectedOption, selected} = this.state
        return (
            <FloatingBox
                element={this.inputContainer.current}
                vPlacement={placement}
                hPlacement='over'
                onBlur={this.onOptionsBlur}>
                <ScrollableList
                    ref={this.list}
                    air='more'
                    className={optionsClassName || styles.options}
                    options={flattenedOptions}
                    selectedOption={selectedOption}
                    onSelect={this.selectOption}
                    onCancel={this.resetFilterOrClose}
                    autoCenter={!selected}
                    tooltipPlacement={optionTooltipPlacement}
                    autoHighlight
                    keyboard
                    alignment={alignment}
                />
            </FloatingBox>
        )
    }

    setFilter(filter = '') {
        this.setState({
            filter,
            matcher: this.matcher(filter)
        })
    }

    resetFilterOrClearSelection() {
        const {filter} = this.state
        filter
            ? this.setFilter()
            : this.selectOption()
    }

    resetFilterOrClose() {
        const {filter} = this.state
        this.setFilter()
        if (!filter) {
            this.hideOptions()
        }
    }

    selectOption(option) {
        this.select$.next(option)
    }

    handleSelect() {
        const {addSubscription} = this.props
        addSubscription(
            this.select$.subscribe(this.onOptionSelected)
        )
    }

    onOptionSelected(option) {
        const {onChange, stayOpenOnSelect} = this.props
        this.setState({
            selectedOption: option,
            selected: false
        }, () => {
            if (stayOpenOnSelect) {
                this.showOptions()
                this.focusInput()
            } else {
                this.hideOptions()
                this.setFilter()
            }
            onChange && onChange(option)
        })
    }

    onOptionsBlur(e) {
        const {onCancel} = this.props
        const isInputClick = e => this.inputContainer.current && this.inputContainer.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains && this.list.current.contains(e.target)
        if (!isInputClick(e) && !isListClick(e)) {
            this.setFilter()
            this.hideOptions()
            onCancel && onCancel(e)
        }
    }

    componentDidMount() {
        const {autoOpen} = this.props
        this.setFilter()
        autoOpen && this.showOptions()
        this.handleSelect()
    }

    shouldComponentUpdate() {
        return !this.state.selected
    }

    componentDidUpdate(prevProps) {
        const {value, options} = this.props
        const {value: prevValue, selectedOption: prevSelectedOption} = prevProps
        const inputChanged = value !== prevValue
        const filteredOptions = this.getFilteredOptions(options)
        const flattenedOptions = this.getFlattenedOptions(filteredOptions)

        const validatedSelectedOption = prevSelectedOption && flattenedOptions.find(option => !option.group && option.value === prevSelectedOption.value)

        const selectedOption = inputChanged
            ? this.getInputOption(flattenedOptions)
            : validatedSelectedOption || this.getInputOption(flattenedOptions)

        this.setStateIfUpdated({
            filteredOptions,
            flattenedOptions,
            selectedOption
        })
    }

    setStateIfUpdated(state) {
        const updatedStateOrNull = (prevState, state) =>
            _.isEqual(_.pick(prevState, _.keys(state)), state) ? null : state
        this.setState(prevState =>
            updatedStateOrNull(prevState, _.isFunction(state) ? state(prevState) : state)
        )
    }

    getInputOption(flattenedOptions) {
        const {value} = this.props
        return flattenedOptions.find(option => !option.group && option.value === value)
    }

    matcher(filter) {
        // match beginning of multiple words in any order (e.g. both "u k" and "k u" match "United Kingdom")
        const parts = splitString(simplifyString(filter))
            .map(part => part ? `(?=.*${(part)})` : '')
        return RegExp(`^${parts.join('')}.*$`, 'i')
    }

    filterGroup(group) {
        const {matchGroups} = this.props
        const {matcher} = this.state
        const filtered = {
            ...group,
            options: matchGroups
                ? matcher.test(simplifyString(group.searchableText || group.label))
                    ? group.options
                    : this.getFilteredOptions(group.options)
                : this.getFilteredOptions(group.options)
        }
        return filtered.options.length ? filtered : null
    }

    getFilteredOptions(options) {
        const {matcher} = this.state
        return _.compact(
            options.map(option =>
                option.options
                    ? this.filterGroup(option)
                    : matcher.test(simplifyString(option.searchableText || option.label))
                    // : matcher.test(option.searchableText || option.label)
                        ? option
                        : null
            )
        )
    }

    getFlattenedOptions(options) {
        return _.flatten(
            options.map(option =>
                option.options
                    ? [{..._.omit(option, 'options'), group: true}, ...option.options]
                    : option
            )
        )
    }
}

export const Combo = compose(
    _Combo,
    withSubscriptions(),
    connect(mapStateToProps)
)

Combo.propTypes = {
    options: PropTypes.any.isRequired,
    additionalButtons: PropTypes.arrayOf(PropTypes.node),
    alignment: PropTypes.oneOf(['left', 'center', 'right', 'fit']),
    allowClear: PropTypes.any,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    border: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    matchGroups: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onCancel: PropTypes.func,
    onChange: PropTypes.func
}

Combo.defaultProps = {
    alignment: 'left',
    border: 'true',
    placement: 'below',
    tooltipPlacement: 'top'
}
