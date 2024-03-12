import {AutoFocus} from 'widget/autoFocus'
import {Button} from 'widget/button'
import {FloatingBox} from 'widget/floatingBox'
import {Input} from 'widget/input'
import {Keybinding} from 'widget/keybinding'
import {ScrollableList} from 'widget/list'
import {Widget} from './widget'
import {compose} from 'compose'
import {connect} from 'connect'
import {escapeRegExp, simplifyString, splitString} from 'string'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './combo.module.css'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class _Combo extends React.Component {
    inputContainer = React.createRef()
    input = React.createRef()
    list = React.createRef()
    
    state = {
        showOptions: false,
        filter: '',
        filteredOptions: [],
        flattenedOptions: [],
        selectedOption: null,
        selected: false,
        focused: false
    }

    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onFocus = this.onFocus.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onInputClick = this.onInputClick.bind(this)
        this.onInputBlur = this.onInputBlur.bind(this)
        this.onOptionsBlur = this.onOptionsBlur.bind(this)
        this.showOptions = this.showOptions.bind(this)
        this.editFilterFromStart = this.editFilterFromStart.bind(this)
        this.editFilterFromEnd = this.editFilterFromEnd.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.resetFilterOrClose = this.resetFilterOrClose.bind(this)
        this.resetFilterOrClearSelection = this.resetFilterOrClearSelection.bind(this)
        this.selectOption = this.selectOption.bind(this)
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
            <Widget
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
            </Widget>
        )
    }

    renderInput() {
        const {placeholder, autoFocus, border, inputClassName, buttons = []} = this.props
        const {filter, selectedOption, showOptions} = this.state
        return (
            <Keybinding
                disabled={!this.isActive() || !this.isFocused()}
                keymap={{
                    ArrowUp: this.showOptions,
                    ArrowDown: this.showOptions,
                    ArrowLeft: _.isEmpty(filter) ? this.editFilterFromStart : null,
                    ArrowRight: _.isEmpty(filter) ? this.editFilterFromEnd : null,
                    Home: this.showOptions,
                    End: this.showOptions,
                    // Enter: null
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
                        placeholder={this.getSelectedOptionValue() || placeholder}
                        disabled={!this.isActive()}
                        buttons={[
                            ...buttons,
                            this.renderClearButton(),
                            this.renderToggleOptionsButton()
                        ]}
                        onChange={this.onChange}
                        onFocus={this.onFocus}
                        onBlur={this.onInputBlur}
                    />
                </AutoFocus>
            </Keybinding>
        )
    }

    getSelectedOptionValue() {
        const {value} = this.props
        const {selectedOption} = this.state
        return selectedOption && !_.isNil(value) ? selectedOption.label : null
    }

    editFilter(callback) {
        this.setFilter(this.getSelectedOptionValue() || '', callback)
    }

    editFilterFromStart() {
        this.editFilter(() => {
            const input = this.input.current
            input.focus()
            input.setSelectionRange(0, 0)
            input.scrollTo({left: 0})
        })
    }

    editFilterFromEnd() {
        this.editFilter(() => {
            const input = this.input.current
            const end = input.value.length
            input.focus()
            input.setSelectionRange(end, end)
            input.scrollTo({left: input.scrollWidth - input.clientWidth})
        })
    }

    onChange(e) {
        const filter = e.target.value
        this.setFilter(filter)
    }

    onFocus() {
        this.setFocused(true)
    }

    focusInput() {
        !isMobile() && this.input.current && this.input.current.focus()
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
        const {allowClear, readOnly} = this.props
        const {filter, selectedOption} = this.state
        const disabled = !filter && (!allowClear || !selectedOption)
        return readOnly
            ? null
            : (
                <Button
                    key='clear'
                    chromeless
                    shape='none'
                    air='none'
                    size='large'
                    icon='xmark'
                    tabIndex={-1}
                    disabled={disabled}
                    onClick={this.resetFilterOrClearSelection}
                />
            )
    }

    renderToggleOptionsButton() {
        const {placement} = this.props
        const {showOptions} = this.state
        const ICON = {
            'below': 'chevron-down',
            'below-or-above': 'chevron-down',
            'above': 'chevron-up',
            'above-or-below': 'chevron-up'
        }
        return (
            <Button
                key='toggle'
                chromeless
                shape='none'
                air='none'
                icon={ICON[placement]}
                iconAttributes={{
                    fixedWidth: true,
                    flip: showOptions ? 'vertical' : null
                }}
                tabIndex={-1}
                disabled={!this.isActive()}
                onClick={this.onClick}
            />
        )
    }

    onClick() {
        const {showOptions} = this.state
        showOptions ? this.hideOptions() : this.showOptions()
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
                    selectedValue={selectedOption?.value}
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

    setFilter(filter, callback) {
        const {onFilterChange} = this.props
        const {showOptions} = this.state
        const nullSafeFilter = filter || ''
        const filterReset = filter === undefined
        onFilterChange && onFilterChange(nullSafeFilter, filterReset)
        if (showOptions) {
            this.focusInput()
        }
        this.setState({
            filter: nullSafeFilter,
            matcher: this.matcher(nullSafeFilter)
        }, callback)
    }

    resetFilterOrClearSelection() {
        const {filter} = this.state
        filter
            ? this.setFilter()
            : this.selectOption()
    }

    resetFilterOrClose() {
        this.setFilter()
        this.hideOptions()
    }

    selectOption(option) {
        const {onChange, stayOpenOnSelect} = this.props
        if (option?.updateFilter) {
            this.setFilter(option.updateFilter)
        } else {
            this.setState({
                selectedOption: option,
                selected: true
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
    }

    componentDidUpdate({value: prevValue, selectedOption: prevSelectedOption}, {filter: prevFilter}) {
        const {value, options} = this.props
        const {filter} = this.state
        const inputChanged = value !== prevValue
        const filteredOptions = this.getFilteredOptions(options)
        const flattenedOptions = this.getFlattenedOptions(filteredOptions)

        const validatedSelectedOption = prevSelectedOption && flattenedOptions.find(option => !option.group && option.value === prevSelectedOption.value)

        const selectedOption = inputChanged
            ? this.getInputOption(flattenedOptions)
            : validatedSelectedOption || this.getInputOption(flattenedOptions)

        if (filter && filter !== prevFilter) {
            this.showOptions()
        }

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
        return this.getInputOptionByAlias(flattenedOptions, value, false)
            || this.getInputOptionByAlias(flattenedOptions, value, true)
    }
    
    getInputOptionByAlias(options, value, alias) {
        return options.find(option => !option.group && !!(option.alias) === alias && option.value === value)
    }

    matcher(filter) {
        // match beginning of multiple words in any order (e.g. both "u k" and "k u" match "United Kingdom")
        const matchers = splitString(simplifyString(escapeRegExp(filter), {removeNonAlphanumeric: false}))
            .map(part => part ? `(?=.*${(part)})` : '') // regexp positive lookahead ("?=")
        return RegExp(`^${matchers.join('')}.*$`, 'i')
    }

    filterOptions(group) {
        const {matcher} = this.state
        const isMatchingGroup = matcher.test(simplifyString(group.searchableText || group.label))
        const filterOptions = _.isFunction(group.filterOptions)
            ? group.filterOptions(isMatchingGroup)
            : group.filterOptions !== false
        const options = filterOptions
            ? this.getFilteredOptions(group.options)
            : group.options
        const filtered = {
            ...group,
            options
        }
        return filtered.options.length || group.showEmptyGroup ? filtered : null
    }

    getFilteredOptions(options) {
        const {matcher} = this.state
        return _.compact(
            options.map(option =>
                option.options
                    ? this.filterOptions(option)
                    : options.forceFilter === false
                        ? null
                        : options.forceFilter === true
                            ? option
                            : matcher.test(simplifyString(option.searchableText || option.label))
                                ? option
                                : null
            )
        )
    }

    getFlattenedOptions(options, parentKey = '') {
        return _.flatten(
            options.map(option => {
                const key = [parentKey, option.key || option.value || option.label].join('|')
                return option.options
                    ? [
                        {..._.omit(option, 'options'), group: true, key},
                        ...this.getFlattenedOptions(option.options, key)
                    ]
                    : {...option, key}
            })
        )
    }
}

export const Combo = compose(
    _Combo,
    connect(mapStateToProps)
)

Combo.propTypes = {
    options: PropTypes.arrayOf(
        PropTypes.shape({
            alias: PropTypes.any,
            disabled: PropTypes.any,
            filterOptions: PropTypes.any,
            indent: PropTypes.any,
            key: PropTypes.string,
            label: PropTypes.any,
            options: PropTypes.arrayOf(
                PropTypes.shape({
                    alias: PropTypes.any,
                    disabled: PropTypes.any,
                    forceFilter: PropTypes.any, // three-state: true = include, false = exclude, undefined = default
                    indent: PropTypes.any,
                    key: PropTypes.string,
                    label: PropTypes.any,
                    render: PropTypes.func,
                    searchableText: PropTypes.string,
                    updateFilter: PropTypes.any,
                    value: PropTypes.any,
                })
            ),
            render: PropTypes.func,
            searchableText: PropTypes.string,
            showEmptyGroup: PropTypes.any,
            updateFilter: PropTypes.any,
            value: PropTypes.any,
        })
    ).isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right', 'fit']),
    allowClear: PropTypes.any,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    border: PropTypes.any,
    busyMessage: PropTypes.any,
    buttons: PropTypes.arrayOf(PropTypes.node),
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below', 'above-or-below', 'below-or-above']),
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onCancel: PropTypes.func,
    onChange: PropTypes.func,
    onFilterChange: PropTypes.func // arguments: filter, filterReset
}

Combo.defaultProps = {
    alignment: 'left',
    border: 'true',
    placement: 'below-or-above',
    tooltipPlacement: 'top'
}
