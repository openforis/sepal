import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Input} from 'widget/input'
import {ScrollableList} from 'widget/list'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {delay} from 'rxjs/operators'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import AutoFocus from 'widget/autoFocus'
import FloatingBox from 'widget/floatingBox'
import Keybinding from 'widget/keybinding'
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
        this.handleBlur = this.handleBlur.bind(this)
    }

    isActive() {
        const {busyMessage, disabled} = this.props
        return !(disabled || busyMessage)
    }

    render() {
        const {errorMessage, busyMessage, standalone, disabled, className, label, labelButtons, tooltip, tooltipPlacement, onCancel} = this.props
        const {showOptions} = this.state
        const onClick = e => {
            if (this.isActive()) {
                return standalone
                    ? onCancel && onCancel(e)
                    : showOptions
                        ? this.hideOptions()
                        : this.showOptions()
            }
        }
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
                    onClick={onClick}>
                    {this.renderInput()}
                </div>
                {showOptions ? this.renderOptions() : null}
            </Form.FieldSet>
        )
    }

    renderInput() {
        const {placeholder, autoFocus, standalone, readOnly, inputClassName, additionalButtons = [], onBlur} = this.props
        const {focused, filter, selectedOption, showOptions} = this.state
        const showOptionsKeyBinding = showOptions ? undefined : () => this.showOptions()
        const keymap = {
            ArrowUp: showOptionsKeyBinding,
            ArrowDown: showOptionsKeyBinding,
            ArrowLeft: showOptionsKeyBinding,
            ArrowRight: showOptionsKeyBinding,
            Home: showOptionsKeyBinding,
            End: showOptionsKeyBinding
        }
        return (
            <Keybinding
                disabled={!this.isActive() || !focused}
                keymap={keymap}>
                <Input
                    ref={this.input}
                    className={[
                        styles.input,
                        standalone ? styles.standalone : null,
                        selectedOption && !showOptions ? styles.fakePlaceholder : null,
                        inputClassName
                    ].join(' ')}
                    value={filter}
                    placeholder={selectedOption && !standalone ? selectedOption.label : placeholder}
                    disabled={!this.isActive()}
                    readOnly={readOnly || isMobile()}
                    buttons={[
                        this.renderClearButton(),
                        this.renderToggleOptionsButton()
                    ]}
                    additionalButtons={additionalButtons}
                    onChange={e => this.setFilter(e.target.value)}
                    onFocus={() => this.setState({focused: true})}
                    onBlur={e => {
                        onBlur && onBlur(e)
                        this.setState({focused: false})
                    }}
                />
                <AutoFocus ref={this.input} enabled={autoFocus}/>
            </Keybinding>
        )
    }

    renderClearButton() {
        const {allowClear} = this.props
        const {selectedOption} = this.state
        return allowClear && selectedOption
            ? (
                <Button
                    key='clear'
                    chromeless
                    shape='none'
                    air='none'
                    icon='times'
                    iconFixedWidth
                    onClick={() => this.select$.next()}
                />
            )
            : null
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
                iconFlipVertical={showOptions}
                iconFixedWidth
                disabled={!this.isActive()}
                onClick={() => showOptions
                    ? this.hideOptions()
                    : this.showOptions()
                }
            />
        )
    }

    renderOptions() {
        const {placement, optionsClassName, optionTooltipPlacement, alignment} = this.props
        const {flattenedOptions, selectedOption, selected} = this.state
        return (
            <FloatingBox
                element={this.inputContainer.current}
                placement={placement}
                onClick={this.handleBlur}>
                <ScrollableList
                    ref={this.list}
                    air='more'
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
            selected: !!selectedOption
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
        const {onChange, addSubscription} = this.props
        addSubscription(
            this.select$.subscribe(
                option => {
                    this.setSelectedOption(option)
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

    handleBlur(e) {
        const {onCancel} = this.props
        const isInputClick = e => this.inputContainer.current && this.inputContainer.current.contains(e.target)
        const isListClick = e => this.list.current && this.list.current.contains && this.list.current.contains(e.target)
        if (!isInputClick(e) && !isListClick(e)) {
            this.setFilter()
            onCancel && onCancel(e)
        }
    }

    componentDidMount() {
        this.setFilter()
        this.handleSelect()
    }

    shouldComponentUpdate() {
        return !this.state.selected
    }

    componentDidUpdate() {
        this.updateOptions()
    }

    matcher(filter) {
        // match beginning of multiple words in any order (e.g. both "u k" and "k u" match "United Kingdom")
        const parts = filter
            .trim()
            .split(/\s+/)
            // .map(part => part ? `(?=.*\\b${escapeStringRegexp(part)})` : '')
            .map(part => part ? `(?=.*${escapeStringRegexp(part)})` : '')
            .join('')
        return RegExp(`^${parts}.*$`, 'i')
    }

    updateOptions() {
        const {options} = this.props
        const {filter} = this.state
        const matcher = this.matcher(filter)
        const filterGroup = group => {
            const filtered = {...group, options: getFilteredOptions(group.options)}
            return filtered.options.length ? filtered : null
        }
        const getFilteredOptions = options =>
            _.compact(
                options.map(option =>
                    option.options
                        ? filterGroup(option)
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

        const getInputOption = () => {
            const {value} = this.props
            return flattenedOptions && flattenedOptions.find(option => !option.group && option.value === value)
        }

        const getSelectedOption = selectedOption => {
            const validatedSelectedOption = selectedOption && flattenedOptions.find(option => option.value === selectedOption.value)
            return validatedSelectedOption || getInputOption()
        }

        this.updateState(prevState =>
            ({
                filteredOptions,
                flattenedOptions,
                selectedOption: getSelectedOption.bind(this)(prevState.selectedOption)
            }))
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
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    allowClear: PropTypes.any,
    autoFocus: PropTypes.any,
    busyMessage: PropTypes.any,
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
    placement: PropTypes.oneOf(['above', 'below']),
    readOnly: PropTypes.any,
    standalone: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onCancel: PropTypes.func,
    onChange: PropTypes.func
}

Combo.defaultProps = {
    alignment: 'left',
    placement: 'below',
    tooltipPlacement: 'top'
}
