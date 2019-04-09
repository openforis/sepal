import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect} from 'store'
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
    input = React.createRef()
    selected = React.createRef()
    highlighted = React.createRef()
    state = {
        select: false,
        dimensions: {},
        filter: '',
        options: [],
        highlightedIndex: null,
        selectedIndex: null,
        selectedValue: '',
        mouseOver: null
    }

    render() {
        const {select} = this.state
        return (
            <div className={styles.combo}>
                {this.renderInput()}
                {select ? this.renderSelectionList() : null}
            </div>
        )
    }

    renderInput() {
        const {autoFocus} = this.props
        const {filter, selectedValue} = this.state
        return (
            <input
                className='combo'
                ref={this.input}
                type='search'
                value={filter}
                placeholder={selectedValue}
                autoFocus={autoFocus}
                onClick={() => this.setState(prevState => ({select: !prevState.select}))}
                onKeyDown={e => this.handleKeypress(e)}
                onChange={e => this.setFilter(e.target.value)}/>
        )
    }

    handleKeypress(e) {
        const {select} = this.state
        if (e.key === 'ArrowDown' && !select) {
            this.setState({select: true})
        }
    }

    handleEnter(e) {
        const {options, highlightedIndex} = this.state
        if (highlightedIndex !== null) {
            this.select(options[highlightedIndex])
        } else if (options.length === 1) {
            this.select(options[0])
        }
        e.preventDefault()
    }

    handleDown() {
        this.setState(prevState => ({
            highlightedIndex: Math.min(prevState.highlightedIndex === null ? 0 : prevState.highlightedIndex + 1, prevState.options.length - 1),
            mouseOver: false
        }))
        this.scrollHighlighted()
    }

    handleUp() {
        this.setState(prevState => ({
            highlightedIndex: Math.max(prevState.highlightedIndex - 1, 0),
            mouseOver: false
        }))
        this.scrollHighlighted()
    }

    handleBottom() {
        this.setState(prevState => ({
            highlightedIndex: prevState.options.length - 1,
            mouseOver: false
        }))
        this.scrollHighlighted()
    }

    handleTop() {
        this.setState({
            highlightedIndex: 0,
            mouseOver: false
        })
        this.scrollHighlighted()
    }

    scrollHighlighted() {
        this.highlighted.current && this.highlighted.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest'
        })
    }

    scrollSelected() {
        this.selected.current && this.selected.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest'
        })
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
                    Enter: e => this.handleEnter(e),
                    ArrowDown: e => this.handleDown(e),
                    ArrowUp: e => this.handleUp(e),
                    Home: e => this.handleTop(e),
                    End: e => this.handleBottom(e)
                }}>
                    <div
                        className={[styles.container, styles[placement]].join(' ')}
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
            select: !!filter,
            filter,
            highlightedIndex: null
        })
        this.updateOptions()
    }

    renderItems() {
        const {options} = this.state
        return options.length
            ? options.map((item, index) => this.renderItem(item, index))
            : this.renderItem({label: 'No results'})
    }

    renderItem(item, index) {
        const {highlightedIndex, selectedValue, mouseOver} = this.state
        const highlighted = index === highlightedIndex
        const selected = item.value === selectedValue
        const disabled = !item.value
        const ref = selected
            ? this.selected
            : highlighted
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
                        highlighted || selected ? null : lookStyles.chromeless,
                        highlighted
                            ? lookStyles.default
                            : selected
                                ? lookStyles.highlight
                                : lookStyles.default
                    ].join(' ')}
                    onMouseOver={() => this.highlight(index)}
                    onClick={() => this.select(item)}>
                    {item.label}
                </li>
            )
    }

    select(item) {
        const {input} = this.props
        this.setSelected(item.label)
        this.setFilter()
        input.set(item.value)
    }

    highlight(highlightedIndex) {
        this.setState({
            highlightedIndex,
            mouseOver: true
        })
    }

    setSelected(selectedValue) {
        this.setState(prevState =>
            prevState.selectedValue !== selectedValue
                ? ({selectedValue})
                : null
        )
        this.scrollSelected()
    }

    componentDidMount() {
        this.setFilter()
        this.updateDimensions()
    }

    componentDidUpdate() {
        const {options, input} = this.props
        const selectedOption = options && input && options.find(option => option.value === input.value)
        const value = selectedOption
            ? selectedOption.label
            : ''
        this.setSelected(value)
        this.updateOptions()
        this.updateDimensions()
    }

    updateOptions() {
        const {options} = this.props
        const {filter} = this.state
        const matcher = RegExp(escapeStringRegexp(filter), 'i')

        const updatedState = (prevState, state) =>
            _.isEqual(prevState.options, state.options)
                ? null
                : state

        this.setState(prevState =>
            updatedState(prevState, {
                options: options.filter(item => matcher.test(item.label)),
                highlightedIndex: null
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
    placement: PropTypes.oneOf(['top', 'bottom'])
}
