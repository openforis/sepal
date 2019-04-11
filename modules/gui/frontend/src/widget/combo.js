import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect} from 'store'
import {filter} from 'rxjs/operators'
import {fromEvent} from 'rxjs'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import Keybinding from 'widget/keybinding'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import escapeStringRegexp from 'escape-string-regexp'
import lookStyles from 'style/look.module.css'
import styles from './combo.module.css'

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class Combo extends React.Component {
    subscriptions = []
    input = React.createRef()
    list = React.createRef()
    highlighted = React.createRef()
    state = {
        dimensions: {},
        showOptions: false,
        filter: '',
        filteredOptions: [],
        flattenedOptions: [],
        highlightedOption: null,
        selectedOption: null,
        mouseOver: null
    }

    render() {
        const {showOptions} = this.state
        return (
            <div className={styles.container}>
                <div
                    ref={this.input}
                    onClick={() => showOptions ? this.hideOptions() : this.showOptions()}>
                    {this.renderInput()}
                </div>
                {showOptions ? this.renderOptions() : null}
            </div>
        )
    }

    renderInput() {
        const {placeholder, autoFocus, disabled, busy} = this.props
        const {filter, selectedOption} = this.state
        const keymap = {
            ArrowUp: () => this.showOptions(),
            ArrowDown: () => this.showOptions()
        }
        return (
            <Keybinding
                disabled={disabled}
                keymap={keymap}>
                <input
                    className={selectedOption ? styles.fakePlaceholder : null}
                    type='search'
                    value={filter}
                    placeholder={selectedOption ? selectedOption.label : placeholder}
                    autoFocus={autoFocus}
                    disabled={disabled || busy || isMobile()}
                    onChange={e => this.setFilter(e.target.value)}/>
            </Keybinding>
        )
    }

    renderOptions() {
        const {placement = 'below'} = this.props
        const {dimensions: {height, top, bottom, left, right}, filteredOptions} = this.state
        const keymap = {
            Enter: () => this.selectHighlighted(),
            Escape: () => this.setFilter(),
            ArrowUp: () => this.highlightPrevious(),
            ArrowDown: () => this.highlightNext(),
            Home: () => this.highlightFirst(),
            End: () => this.highlightLast()
        }
        const style = {
            '--left': left,
            '--width': right - left,
            '--above-height': top,
            '--above-bottom': height - top,
            '--below-height': height - bottom,
            '--below-top': bottom
        }
        return (
            <Portal>
                <Keybinding keymap={keymap}>
                    <div
                        ref={this.list}
                        className={[styles.list, styles[placement]].join(' ')}
                        style={style}>
                        <ScrollableContainer>
                            <Scrollable className={styles.items}>
                                <ul>
                                    {this.renderItems(filteredOptions)}
                                </ul>
                            </Scrollable>
                        </ScrollableContainer>
                    </div>
                </Keybinding>
            </Portal>
        )
    }

    renderItems(options) {
        return options.length
            ? options.map((item, index) => this.renderItem(item, index))
            : this.renderItem({label: 'No results'}) // [TODO] msg
    }

    renderItem(item, index) {
        return item.value
            ? this.renderSelectableItem(item)
            : item.options
                ? this.renderGroup(item, index)
                : this.renderNonSelectableItem(item, index)
    }

    renderGroup(item, index) {
        return (
            <React.Fragment>
                <li
                    key={index}
                    className={styles.group}>
                    {item.label}
                </li>
                {this.renderItems(item.options)}
            </React.Fragment>
        )
    }

    renderNonSelectableItem(item, index) {
        return (
            <li
                key={item.value || index}
                className={[
                    lookStyles.look,
                    lookStyles.nonInteractive,
                    lookStyles.noTransitions,
                ].join(' ')}>
                {item.label}
            </li>
        )
    }

    isHighlighted(option) {
        const {highlightedOption} = this.state
        return highlightedOption && option && highlightedOption.value === option.value
    }

    renderSelectableItem(item) {
        const {mouseOver} = this.state
        const highlighted = this.isHighlighted(item)
        const ref = highlighted
            ? this.highlighted
            : null
        return (
            <li
                ref={ref}
                key={item.value}
                className={[
                    lookStyles.look,
                    lookStyles.noTransitions,
                    mouseOver ? null : lookStyles.noHover,
                    highlighted ? null : lookStyles.chromeless,
                    lookStyles.default
                ].join(' ')}
                onMouseOver={() => this.highlightOption(item)}
                onClick={() => this.selectOption(item)}>
                {item.label}
            </li>
        )
    }

    showOptions() {
        const {showOptions, flattenedOptions, selectedOption} = this.state
        if (!showOptions) {
            const highlightedOption = selectedOption || flattenedOptions[0]
            this.setState({
                showOptions: true,
                highlightedOption
            }, this.scroll)
        }
    }

    hideOptions() {
        this.setState({
            showOptions: false
        })
    }

    selectHighlighted() {
        const {highlightedOption} = this.state
        if (highlightedOption) {
            this.selectOption(highlightedOption)
        }
    }

    highlightPrevious() {
        const previousOption = (options, option) => {
            const index = _.indexOf(options, option)
            return index === -1
                ? null
                : options[Math.max(0, index - 1)]
        }
        this.setState(prevState => ({
            highlightedOption: previousOption(prevState.flattenedOptions, prevState.highlightedOption),
            mouseOver: false
        }), this.scroll)
    }

    highlightNext() {
        const nextOption = (options, option) => {
            const index = _.indexOf(options, option)
            return index === -1
                ? null
                : options[Math.min(options.length - 1, index + 1)]
        }
        this.setState(prevState => ({
            highlightedOption: nextOption(prevState.flattenedOptions, prevState.highlightedOption),
            mouseOver: false
        }), this.scroll)
    }

    highlightFirst() {
        const firstOption = options => options[0]
        this.setState(prevState => ({
            highlightedOption: firstOption(prevState.flattenedOptions),
            mouseOver: false
        }), this.scroll)
    }

    highlightLast() {
        const lastOption = options => options[options.length - 1]
        this.setState(prevState => ({
            highlightedOption: lastOption(prevState.flattenedOptions),
            mouseOver: false
        }), this.scroll)
    }

    scroll() {
        this.highlighted.current && this.highlighted.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest'
        })
    }

    setFilter(filter = '') {
        this.setState({
            showOptions: !!filter,
            filter,
            highlightedOption: null
        }, this.updateOptions)
    }

    selectOption(item) {
        const {input, onChange} = this.props
        this.setSelectedOption(item)
        this.setFilter()
        input.set(item.value)
        onChange && onChange({
            value: item.value
        })
    }

    highlightOption(highlightedOption) {
        this.setState({
            highlightedOption,
            mouseOver: true
        })
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

    componentDidMount() {
        const click$ = fromEvent(document, 'click').pipe(
            filter(() => this.state.showOptions)
        )
        const isInternalClick = e =>
            this.list.current.contains(e.target) || this.input.current.contains(e.target)

        this.subscriptions.push(
            click$.subscribe(
                e => isInternalClick(e) || this.setFilter()
            )
        )
        this.setFilter()
        this.updateDimensions()
    }

    componentDidUpdate() {
        this.updateOptions()
        this.updateDimensions()
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
                        : matcher.test(option.label)
                            ? option
                            : null
                )
            )
        const getFlattenedOptions = options =>
            _.flatten(
                options.map(option =>
                    option.options
                        ? option.options
                        : option
                )
            )
        const filteredOptions = getFilteredOptions(options)
        const flattenedOptions = getFlattenedOptions(filteredOptions)

        const getFirstOption = () =>
            flattenedOptions && flattenedOptions.find(option => option.value)

        const getSelectedOption = () =>
            input && flattenedOptions && flattenedOptions.find(option => option.value === input.value)

        this.updateState(prevState => ({
            filteredOptions,
            flattenedOptions,
            highlightedOption: prevState.highlightedOption || getFirstOption(),
            selectedOption: prevState.selectedOption || getSelectedOption()
        }))
    }

    updateDimensions() {
        const {dimensions: {height}} = this.props
        const {top, bottom, left, right} = this.getBoundingBox()
        this.updateState({dimensions: {height, top, bottom, left, right}})
    }

    getBoundingBox() {
        const ref = this.input.current
        return ref
            ? ref.getBoundingClientRect()
            : {}
    }
}

export default connect(mapStateToProps)(Combo)

Combo.propTypes = {
    input: PropTypes.any.isRequired,
    options: PropTypes.any.isRequired,
    autoFocus: PropTypes.any,
    busy: PropTypes.any,
    disabled: PropTypes.any,
    keepOpen: PropTypes.any,
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['above', 'below']),
    onChange:  PropTypes.func
}
