import {Button} from 'widget/button'
import {EMPTY, Subject, animationFrameScheduler, interval} from 'rxjs'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {compose} from 'compose'
import {distinctUntilChanged, filter, map, scan, switchMap} from 'rxjs/operators'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import _ from 'lodash'
import styles from './list.module.css'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

const ANIMATION_SPEED = .2

const getContainer = element =>
    element && element.parentNode && element.parentNode.parentNode

const targetScrollOffset = element => {
    const container = getContainer(element)
    return container
        ? Math.round(element.offsetTop - (getContainer(element).clientHeight - element.clientHeight) / 2)
        : null
}

const currentScrollOffset = element => {
    const container = getContainer(element)
    return container
        ? container.scrollTop
        : null
}

const setScrollOffset = (element, value) => {
    const container = getContainer(element)
    if (container) {
        container.scrollTop = value
    }
}

const lerp = rate =>
    (value, targetValue) => value + (targetValue - value) * rate

class List extends React.Component {
    highlighted = React.createRef()
    selected = React.createRef()
    update$ = new Subject()
    state = {
        highlightedOption: null,
        overrideHover: false
    }

    constructor(props) {
        super(props)
        const {forwardedRef} = props
        this.list = forwardedRef
            ? forwardedRef
            : React.createRef()
    }

    render() {
        const {onCancel, className, keyboard} = this.props
        const keymap = {
            Escape: onCancel ? onCancel : null,
            Enter: () => this.selectHighlighted(),
            ArrowLeft: () => this.highlightPrevious(),
            ArrowRight: () => this.highlightNext(),
            ArrowUp: () => this.highlightPrevious(),
            ArrowDown: () => this.highlightNext(),
            Home: () => this.highlightFirst(),
            End: () => this.highlightLast()
        }
        return (
            <Keybinding keymap={keymap} disabled={!keyboard}>
                <ReactResizeDetector handleHeight onResize={() => this.update$.next()}>
                    <ScrollableContainer className={className}>
                        <Scrollable
                            className={styles.options}
                            direction='xy'
                            onHover={element => this.onHover(element)}>
                            {scrollableContainerHeight => this.renderList(scrollableContainerHeight)}
                        </Scrollable>
                    </ScrollableContainer>
                </ReactResizeDetector>
            </Keybinding>
        )
    }

    renderList(scrollableContainerHeight = 0) {
        const {options, overScroll} = this.props
        return (
            <ul
                ref={this.list}
                style={{
                    '--scrollable-container-height': overScroll ? scrollableContainerHeight : 0
                }}
                onMouseLeave={() => this.update$.next()}
            >
                {this.renderOptions(options)}
            </ul>
        )
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

    renderOptions(options) {
        return options.length
            ? options.map((option, index) => this.renderOption(option, index))
            : this.renderOption({label: 'No results'}) // [TODO] msg
    }

    renderOption(option, index) {
        return option.value !== undefined && !option.disabled
            ? this.renderSelectableOption(option)
            : option.group
                ? this.renderGroup(option, index)
                : this.renderNonSelectableOption(option, index)
    }

    renderGroup(option, index) {
        const {alignment} = this.props
        return (
            <li key={index}>
                <Button
                    chromeless
                    look='transparent'
                    additionalClassName={styles.group}
                    label={option.label}
                    width='fill'
                    alignment={alignment}
                    disabled
                />
            </li>
        )
    }

    renderNonSelectableOption(option, index) {
        const {alignment} = this.props
        return (
            <li key={option.value || index}>
                <Button
                    chromeless
                    look='transparent'
                    label={option.label}
                    width='fill'
                    alignment={alignment}
                    disabled
                />
            </li>
        )
    }

    renderSelectableOption(option) {
        const {selectedOption, tooltipPlacement, alignment} = this.props
        const {overrideHover} = this.state
        const selected = this.isSelected(option)
        const highlighted = this.isHighlighted(option)
        const ref = selected
            ? this.selected
            : highlighted
                ? this.highlighted
                : null
        return (
            <li
                key={option.value}
                data-option-value={option.value}
                ref={ref}>
                <Button
                    chromeless={!selected}
                    look={selected ? 'selected' : 'highlight'}
                    label={option.label}
                    tooltip={option.tooltip}
                    tooltipPlacement={tooltipPlacement}
                    hover={overrideHover ? highlighted : null}
                    width='fill'
                    alignment={alignment}
                    disableTransitions
                    onMouseOver={() => this.highlightOption(option)}
                    onMouseOut={() => this.highlightOption(selectedOption)}
                    onClick={() => this.selectOption(option)}
                />
            </li>
        )
    }

    isSelected(option) {
        const {selectedOption} = this.props
        return option === selectedOption
    }

    isSelectable(option) {
        return !option.group && option.value
    }

    isHighlighted(option) {
        const {highlightedOption} = this.state
        return highlightedOption && option && highlightedOption.value === option.value
    }

    selectHighlighted() {
        const {highlightedOption} = this.state
        if (highlightedOption) {
            this.selectOption(highlightedOption)
        }
    }

    cancel() {
        const {onCancel} = this.props
        onCancel && onCancel()
    }

    getSelectedOption() {
        const {options, selectedOption} = this.props
        return _.find(options, option => option === selectedOption)
    }

    getPreviousSelectableOption(option) {
        const {options} = this.props
        const index = _.indexOf(options, option)
        const previousIndex =
            index === -1
                ? options.length - 1
                : Math.max(index - 1, 0)
        return _.findLast(options, option => this.isSelectable(option), previousIndex) || option
    }

    getNextSelectableOption(option) {
        const {options} = this.props
        const nextIndex = Math.min(_.indexOf(options, option) + 1, options.length - 1)
        return _.find(options, option => this.isSelectable(option), nextIndex) || option
    }

    getFirstSelectableOption() {
        const {options} = this.props
        return _.find(options, option => this.isSelectable(option))
    }

    getLastSelectableOption() {
        const {options} = this.props
        return _.findLast(options, option => this.isSelectable(option))
    }

    highlightOption(highlightedOption) {
        this.setState({
            highlightedOption,
            overrideHover: false
        })
    }

    highlightPrevious() {
        this.setState(({highlightedOption}) => ({
            highlightedOption: this.getPreviousSelectableOption(highlightedOption),
            overrideHover: true
        }), this.scroll)
    }

    highlightNext() {
        this.setState(({highlightedOption}) => ({
            highlightedOption: this.getNextSelectableOption(highlightedOption),
            overrideHover: true
        }), this.scroll)
    }

    highlightFirst() {
        this.setState({
            highlightedOption: this.getFirstSelectableOption(),
            overrideHover: true
        }, this.scroll)
    }

    highlightLast() {
        this.setState({
            highlightedOption: this.getLastSelectableOption(),
            overrideHover: true
        }, this.scroll)
    }

    onHover(element) {
        if (element.parentElement.parentElement === this.list.current) {
            const optionValue = element.parentElement.getAttribute('data-option-value')
            this.highlightOptionByValue(optionValue)
        }
    }

    highlightOptionByValue(value) {
        const {options} = this.props
        const highlightedOption = _.find(options, option => option.value === value)
        if (highlightedOption) {
            this.setState({
                highlightedOption,
                overrideHover: true
            })
        }
    }

    scroll() {
        this.highlighted.current && this.highlighted.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest'
        })
    }

    selectOption(option) {
        const {onSelect} = this.props
        onSelect && onSelect(option)
    }

    initializeCenterHighlighted() {
        const {addSubscription} = this.props
        const animationFrame$ = interval(0, animationFrameScheduler)
        const scroll$ = this.update$.pipe(
            map(() => this.selected.current),
            filter(element => element),
            switchMap(element => {
                const target = targetScrollOffset(element)
                return Math.round(currentScrollOffset(element)) === target
                    ? EMPTY
                    : animationFrame$.pipe(
                        map(() => target),
                        scan(lerp(ANIMATION_SPEED), currentScrollOffset(element)),
                        map(value => Math.round(value)),
                        distinctUntilChanged(),
                        map(value => ({element, value}))
                    )
            })
        )

        addSubscription(
            scroll$.subscribe(
                ({element, value}) => {
                    this.props.autoCenter && setScrollOffset(element, value)
                }
            )
        )
    }

    highlightSelectedOption() {
        const {autoHighlight} = this.props
        const highlightedOption = this.getSelectedOption() || (autoHighlight && this.getFirstSelectableOption())
        this.setState({
            highlightedOption,
            overrideHover: true
        }, () => this.update$.next())
    }

    componentDidMount() {
        this.initializeCenterHighlighted()
        this.highlightSelectedOption()
    }

    shouldComponentUpdate(nextProps, nextState) {
        if (!_.isEqual(nextProps, this.props)) {
            return true
        }
        if (nextState.overrideHover !== this.state.overrideHover) {
            return true
        }
        if (nextState.overrideHover && nextState.highlightedOption !== this.state.highlightedOption) {
            return true
        }
        return false
    }

    componentDidUpdate() {
        const {options} = this.props
        const {highlightedOption} = this.state
        if (!_.find(options, highlightedOption)) {
            this.highlightSelectedOption()
        }
    }
}

export default compose(
    List,
    withSubscriptions(),
    withForwardedRef()
)

List.propTypes = {
    options: PropTypes.arrayOf(
        PropTypes.shape({
            label: PropTypes.oneOfType([PropTypes.number, PropTypes.string, PropTypes.array]),
            value: PropTypes.any
        })
    ).isRequired,
    onSelect: PropTypes.func.isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    autoCenter: PropTypes.any,
    autoHighlight: PropTypes.any,
    className: PropTypes.string,
    keyboard: PropTypes.any,
    overScroll: PropTypes.any,
    ref: PropTypes.object,
    selectedOption: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.oneOf(['left', 'right']),
    onCancel: PropTypes.func
}

List.defaultProps = {
    alignment: 'left',
    tooltipPlacement: 'right'
}
