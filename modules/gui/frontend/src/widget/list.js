import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Subject, animationFrameScheduler, interval} from 'rxjs'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, filter, map, scan, switchMap} from 'rxjs/operators'
import {selectFrom} from 'stateUtils'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import lookStyles from 'style/look.module.css'
import styles from './list.module.css'

const ANIMATION_SPEED = .2
const AUTO_CENTER_DELAY = 1000

const targetScrollOffset = element => {
    const container = element.parentNode.parentNode
    return Math.round(element.offsetTop - container.offsetTop - (container.clientHeight - element.clientHeight) / 2)
}

const currentScrollOffset = element =>
    element.parentNode.parentNode.scrollTop

const setScrollOffset = (element, value) =>
    element.parentNode.parentNode.scrollTop = value

const lerp = rate =>
    (value, targetValue) => value + (targetValue - value) * rate

const mapStateToProps = state => ({
    dimensions: selectFrom(state, 'dimensions') || []
})

class List extends React.Component {
    subscriptions = []
    list = React.createRef()
    highlighted = React.createRef()
    scrollHighlighted$ = new Subject()
    state = {
        highlightedOption: null,
        mouseOver: null
    }

    render() {
        const {options} = this.props
        const keymap = {
            Escape: () => this.cancel(),
            Enter: () => this.selectHighlighted(),
            ArrowUp: () => this.highlightPrevious(),
            ArrowDown: () => this.highlightNext(),
            Home: () => this.highlightFirst(),
            End: () => this.highlightLast()
        }
        return (
            <Keybinding keymap={keymap}>
                <ScrollableContainer>
                    <Scrollable className={styles.options}>
                        <ul>
                            {this.renderOptions(options)}
                        </ul>
                    </Scrollable>
                </ScrollableContainer>
            </Keybinding>
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
            : option.options
                ? this.renderGroup(option, index)
                : this.renderNonSelectableOption(option, index)
    }

    renderGroup(option, index) {
        return (
            <React.Fragment key={index}>
                <li
                    className={styles.group}>
                    {option.label}
                </li>
                {this.renderOptions(option.options)}
            </React.Fragment>
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

    isSelected(option) {
        const {selectedOption} = this.props
        return option === selectedOption
    }

    isHighlighted(option) {
        const {highlightedOption} = this.state
        return highlightedOption && option && highlightedOption.value === option.value
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

    highlightOption(highlightedOption) {
        this.setState({
            highlightedOption,
            mouseOver: true
        })
    }

    highlightPrevious() {
        const {options} = this.props
        const previousOption = (options, option) => {
            const index = _.indexOf(options, option)
            return index === -1
                ? null
                : options[Math.max(0, index - 1)]
        }
        this.setState(prevState => ({
            highlightedOption: previousOption(options, prevState.highlightedOption),
            mouseOver: false
        }), this.scroll)
    }

    highlightNext() {
        const {options} = this.props
        const nextOption = (options, option) => {
            const index = _.indexOf(options, option)
            return index === -1
                ? null
                : options[Math.min(options.length - 1, index + 1)]
        }
        this.setState(prevState => ({
            highlightedOption: nextOption(options, prevState.highlightedOption),
            mouseOver: false
        }), this.scroll)
    }

    highlightFirst() {
        const {options} = this.props
        const firstOption = options => options[0]
        this.setState({
            highlightedOption: firstOption(options),
            mouseOver: false
        }, this.scroll)
    }

    highlightLast() {
        const {options} = this.props
        const lastOption = options => options[options.length - 1]
        this.setState({
            highlightedOption: lastOption(options),
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
        const {options, selectedOption} = this.props
        const highlightedOption = _.find(options, selectedOption) || options[0]
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
                ({element, value}) =>
                    setScrollOffset(element, Math.round(value))
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

export default connect(mapStateToProps)(List)

List.propTypes = {
    options: PropTypes.any.isRequired,
    onSelect:  PropTypes.func.isRequired,
    autoCenter: PropTypes.any,
    selectedOption: PropTypes.any,
    onCancel:  PropTypes.func
}
