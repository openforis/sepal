import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Subject, animationFrameScheduler, interval} from 'rxjs'
import {debounceTime, distinctUntilChanged, filter, map, scan, switchMap} from 'rxjs/operators'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import styles from './list.module.css'

const ANIMATION_SPEED = .2
const AUTO_CENTER_DELAY = 1000

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

const isSelectableOption = option => !option.group && option.value

export default class List extends React.Component {
    subscriptions = []
    list = React.createRef()
    highlighted = React.createRef()
    scrollHighlighted$ = new Subject()
    state = {
        highlightedOption: null,
        mouseOver: null
    }

    render() {
        const {onCancel, className} = this.props
        const keymap = {
            Escape: onCancel ? onCancel : null,
            Enter: () => this.selectHighlighted(),
            ArrowUp: () => this.highlightPrevious(),
            ArrowDown: () => this.highlightNext(),
            Home: () => this.highlightFirst(),
            End: () => this.highlightLast()
        }
        return (
            <Keybinding keymap={keymap}>
                <ReactResizeDetector
                    handleHeight
                    onResize={() => this.scrollHighlighted$.next()}>
                    <ScrollableContainer className={className}>
                        <Scrollable className={styles.options}>
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
            <ul style={{
                '--scrollable-container-height': overScroll ? scrollableContainerHeight : 0
            }}>
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
        return option.value !== undefined
            ? this.renderSelectableOption(option)
            : option.group
                ? this.renderGroup(option, index)
                : this.renderNonSelectableOption(option, index)
    }

    renderGroup(option, index) {
        return (
            <li
                key={index}
                className={styles.group}>
                {option.label}
            </li>
        )
    }

    renderNonSelectableOption(option, index) {
        return (
            <li
                key={option.value || index}
                className={[
                    lookStyles.look,
                    lookStyles.nonInteractive,
                    lookStyles.noTransitions,
                ].join(' ')}>
                {option.label}
            </li>
        )
    }

    renderSelectableOption(option) {
        const {selectedOption} = this.props
        const {mouseOver} = this.state
        const selected = this.isSelected(option)
        const highlighted = this.isHighlighted(option)
        const ref = highlighted
            ? this.highlighted
            : null
        return (
            <li
                ref={ref}
                key={option.value}
                className={[
                    lookStyles.look,
                    lookStyles.noTransitions,
                    mouseOver ? null : lookStyles.noHover,
                    highlighted || selected ? null : lookStyles.chromeless,
                    selected ? lookStyles.default : lookStyles.transparent
                ].join(' ')}
                onMouseOver={() => this.highlightOption(option)}
                onMouseOut={() => this.highlightOption(selectedOption)}
                onClick={() => this.selectOption(option)}>
                {option.label}
            </li>
        )
    }

    isSelected(option) {
        const {selectedOption} = this.props
        return option === selectedOption
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
        return _.findLast(options, option =>
            isSelectableOption(option), Math.max(_.indexOf(options, option) - 1, 0)
        ) || option
    }

    getNextSelectableOption(option) {
        const {options} = this.props
        return _.find(options, option =>
            isSelectableOption(option), _.indexOf(options, option) + 1
        ) || option
    }

    getFirstSelectableOption() {
        const {options} = this.props
        return _.find(options, option => isSelectableOption(option))
    }

    getLastSelectableOption() {
        const {options} = this.props
        return _.findLast(options, option => isSelectableOption(option))
    }

    highlightOption(highlightedOption) {
        this.setState({
            highlightedOption,
            mouseOver: true
        })
    }

    highlightPrevious() {
        this.setState(prevState => ({
            highlightedOption: this.getPreviousSelectableOption(prevState.highlightedOption),
            mouseOver: false
        }), this.scroll)
    }

    highlightNext() {
        this.setState(prevState => ({
            highlightedOption: this.getNextSelectableOption(prevState.highlightedOption),
            mouseOver: false
        }), this.scroll)
    }

    highlightFirst() {
        this.setState({
            highlightedOption: this.getFirstSelectableOption(),
            mouseOver: false
        }, this.scroll)
    }

    highlightLast() {
        this.setState({
            highlightedOption: this.getLastSelectableOption(),
            mouseOver: false
        }, this.scroll)
    }

    scroll() {
        this.highlighted.current && this.highlighted.current.scrollIntoView({
            behavior: 'auto',
            block: 'nearest'
        })
    }

    selectOption(option) {
        const {onSelect} = this.props
        onSelect(option)
        this.scrollHighlighted$.next()
    }

    autoCenterWhenIdle(scroll$) {
        return scroll$.pipe(
            debounceTime(AUTO_CENTER_DELAY)
        ).subscribe(() => {
            this.centerSelected()
        })
    }

    update() {
        const highlightedOption = this.getSelectedOption() || this.getFirstSelectableOption()
        this.setState({highlightedOption}, () => this.scrollHighlighted$.next())
    }

    initializeAutoScroll() {
        const animationFrame$ = interval(0, animationFrameScheduler)
        this.subscriptions.push(
            this.scrollHighlighted$.pipe(
                map(() => this.highlighted.current),
                filter(element => element),
                switchMap(element => {
                    const target = targetScrollOffset(element)
                    return animationFrame$.pipe(
                        map(() => target),
                        scan(lerp(ANIMATION_SPEED), currentScrollOffset(element)),
                        map(value => Math.round(value)),
                        distinctUntilChanged(),
                        map(value => ({element, value}))
                    )
                })
            ).subscribe(
                ({element, value}) => setScrollOffset(element, value)
            )
        )
    }

    componentDidMount() {
        this.initializeAutoScroll()
        this.update()
    }

    componentDidUpdate(prevProps) {
        if (!_.isEqual(prevProps, this.props)) {
            this.update()
        }
    }

    componentWillUnmount() {
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
    }
}

List.propTypes = {
    options: PropTypes.any.isRequired,
    onSelect:  PropTypes.func.isRequired,
    autoCenter: PropTypes.any,
    className: PropTypes.string,
    overScroll: PropTypes.any,
    selectedOption: PropTypes.any,
    onCancel:  PropTypes.func
}
