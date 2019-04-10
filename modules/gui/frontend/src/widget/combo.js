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
        showList: false,
        filter: '',
        filteredOptions: [],
        selectedIndex: null,
        highlightedIndex: null,
        selectedOption: null,
        mouseOver: null
    }

    render() {
        const {showList} = this.state
        return (
            <div className={styles.combo}>
                <div
                    ref={this.input}
                    onClick={() => showList ? this.hideList() : this.showList()}>
                    {this.renderInput()}
                </div>
                {showList ? this.renderSelectionList() : null}
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
                    ArrowUp: () => this.showList(),
                    ArrowDown: () => this.showList()
                }}>
                <input
                    className={selectedOption ? 'combo' : null}
                    type='search'
                    value={filter}
                    placeholder={selectedOption ? selectedOption.label : placeholder}
                    autoFocus={autoFocus}
                    disabled={disabled || busy || isMobile()}
                    onChange={e => this.setFilter(e.target.value)}/>
            </Keybinding>
        )
    }

    showList() {
        const {showList, selectedIndex} = this.state
        if (!showList) {
            this.setState({
                showList: true,
                highlightedIndex: selectedIndex === -1 ? 0 : selectedIndex
            }, () => this.scrollHighlighted())
        }
    }

    hideList() {
        this.setState({
            showList: false
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

    renderSelectionList() {
        const {placement = 'bottom'} = this.props
        const {dimensions: {height, top, bottom, left, right}} = this.state
        const placementHeight = {
            top: top,
            bottom: height - bottom
        }
        const style = {
            '--left': left,
            '--height': placementHeight[placement],
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
                            <Scrollable>
                                <ul className={styles.items}>
                                    {this.renderItems()}
                                </ul>
                            </Scrollable>
                        </ScrollableContainer>
                    </div>
                </Keybinding>
            </Portal>
        )
    }

    setFilter(filter = '') {
        this.setState({
            showList: !!filter,
            filter,
            highlightedIndex: 0
        })
        this.updateOptions()
    }

    renderItems() {
        const {filteredOptions} = this.state
        return filteredOptions.length
            ? filteredOptions.map((item, index) => this.renderItem(item, index))
            : this.renderItem({label: 'No results'}) // [TODO] msg
    }

    renderItem(item, index) {
        const {highlightedIndex, mouseOver} = this.state
        const highlighted = highlightedIndex === index
        const disabled = !item.value
        const ref = highlighted
            ? this.highlighted
            : null
        return disabled
            ? (
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
            : (
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
            filter(() => this.state.showList)
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

    updateOptions() {
        const {options} = this.props
        const {filter, selectedOption} = this.state
        const matcher = RegExp(escapeStringRegexp(filter), 'i')
        const filteredOptions = options.filter(item => matcher.test(item.label))
        const selectedIndex = filteredOptions.findIndex(option => option === selectedOption)

        const updatedState = (prevState, state) =>
            _.isEqual([
                prevState.filteredOptions,
                prevState.selectedIndex
            ], [
                state.filteredOptions,
                state.selectedIndex
            ])
                ? null
                : state

        this.setState(prevState =>
            updatedState(prevState, {
                filteredOptions,
                selectedIndex
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
