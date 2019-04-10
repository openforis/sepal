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
        highlightedIndex: null,
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
        return (
            <Keybinding
                disabled={disabled}
                keymap={{
                    ArrowUp: () => this.showOptions(),
                    ArrowDown: () => this.showOptions()
                }}>
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
        const {placement = 'bottom'} = this.props
        const {dimensions: {height, top, bottom, left, right}} = this.state
        const heightByPlacement = {
            top: top,
            bottom: height - bottom
        }
        const style = {
            '--left': left,
            '--height': heightByPlacement[placement],
            '--width': right - left,
            '--top': top,
            '--bottom': bottom
        }
        return (
            <Portal>
                <Keybinding keymap={{
                    Enter: () => this.handleEnter(),
                    Escape: () => this.handleEscape(),
                    ArrowUp: () => this.highlightPrevious(),
                    ArrowDown: () => this.highlightNext(),
                    Home: () => this.highlightFirst(),
                    End: () => this.highlightLast()
                }}>
                    <div
                        ref={this.list}
                        className={[styles.list, styles[placement]].join(' ')}
                        style={style}>
                        <ScrollableContainer>
                            <Scrollable className={styles.items}>
                                <ul>
                                    {this.renderItems()}
                                </ul>
                            </Scrollable>
                        </ScrollableContainer>
                    </div>
                </Keybinding>
            </Portal>
        )
    }

    renderItems() {
        const {filteredOptions} = this.state
        return filteredOptions.length
            ? filteredOptions.map((item, index) => this.renderItem(item, index))
            : this.renderItem({label: 'No results'}) // [TODO] msg
    }

    renderItem(item, index) {
        const disabled = !item.value
        return disabled
            ? this.renderNonSelectableItem(item)
            : this.renderSelectableItem(item, index)
    }

    renderNonSelectableItem(item) {
        return (
            <li
                key={item.value}
                className={[
                    lookStyles.look,
                    lookStyles.nonInteractive,
                    lookStyles.noTransitions,
                ].join(' ')}>
                {item.label}
            </li>
        )
    }

    renderSelectableItem(item, index) {
        const {highlightedIndex, mouseOver} = this.state
        const highlighted = highlightedIndex === index
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
                onMouseOver={() => this.highlight(index)}
                onClick={() => this.select(item)}>
                {item.label}
            </li>
        )
    }

    showOptions() {
        const {showOptions, filteredOptions, selectedOption} = this.state
        if (!showOptions) {
            const selectedIndex = filteredOptions.findIndex(option => option.value === selectedOption.value)
            const highlightedIndex = Math.max(selectedIndex, 0)
            this.setState({
                showOptions: true,
                highlightedIndex
            }, () => this.scrollHighlighted())
        }
    }

    hideOptions() {
        this.setState({
            showOptions: false
        })
    }

    handleEnter() {
        const {filteredOptions, highlightedIndex} = this.state
        if (highlightedIndex !== null) {
            this.select(filteredOptions[highlightedIndex])
        }
    }

    handleEscape() {
        this.setFilter()
    }

    highlightPrevious() {
        this.setState(prevState => ({
            highlightedIndex: Math.max(prevState.highlightedIndex - 1, 0),
            mouseOver: false
        }))
        this.scrollHighlighted()
    }

    highlightNext() {
        this.setState(prevState => ({
            highlightedIndex: Math.min(prevState.highlightedIndex === null ? 0 : prevState.highlightedIndex + 1, prevState.filteredOptions.length - 1),
            mouseOver: false
        }))
        this.scrollHighlighted()
    }

    highlightFirst() {
        this.setState({
            highlightedIndex: 0,
            mouseOver: false
        })
        this.scrollHighlighted()
    }

    highlightLast() {
        this.setState(prevState => ({
            highlightedIndex: prevState.filteredOptions.length - 1,
            mouseOver: false
        }))
        this.scrollHighlighted()
    }

    scrollHighlighted() {
        const {highlightedIndex} = this.state
        if (highlightedIndex) {
            this.highlighted.current && this.highlighted.current.scrollIntoView({
                behavior: 'auto',
                block: 'nearest'
            })
        }
    }

    setFilter(filter = '') {
        this.setState({
            showOptions: !!filter,
            filter,
            highlightedIndex: 0
        })
        this.updateOptions()
    }

    select(item) {
        const {input, onChange} = this.props
        this.setSelectedOption(item)
        this.setFilter()
        input.set(item.value)
        onChange && onChange({
            value: item.value
        })
    }

    highlight(highlightedIndex) {
        this.setState({
            highlightedIndex,
            mouseOver: true
        })
    }

    setSelectedOption(selectedOption) {
        this.setState(prevState =>
            prevState.selectedOption !== selectedOption
                ? ({selectedOption})
                : null
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
        const {options, input} = this.props
        const selectedOption = options && input && options.find(option => option.value === input.value)
        this.setSelectedOption(selectedOption)
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
        const {options} = this.props
        const {filter} = this.state
        const matcher = this.matcher(filter)
        const filteredOptions = options.filter(item => matcher.test(item.label))

        const updatedState = (prevState, state) =>
            _.isEqual(prevState.filteredOptions, state.filteredOptions)
                ? null
                : state

        this.setState(prevState =>
            updatedState(prevState, {
                filteredOptions
            })
        )
    }

    updateDimensions() {
        const {dimensions: {height}} = this.props
        const {top, bottom, left, right} = this.getBoundingBox()

        const updatedState = (prevState, state) =>
            _.isEqual(prevState.dimensions, state.dimensions)
                ? null
                : state

        this.setState(prevState =>
            updatedState(prevState, {
                dimensions: {height, top, bottom, left, right}
            })
        )
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
    placeholder: PropTypes.string,
    placement: PropTypes.oneOf(['top', 'bottom']),
    onChange:  PropTypes.func
}
