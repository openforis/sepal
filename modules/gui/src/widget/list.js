import {Button} from '~/widget/button'
import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {Keybinding} from '~/widget/keybinding'
import {Scrollable} from '~/widget/scrollable'
import {Subject, debounceTime, distinctUntilChanged, exhaustMap, first, fromEvent, merge, switchMap, takeUntil, timer} from 'rxjs'
import {compose} from '~/compose'
import {isEqual} from '~/hash'
import {msg} from '~/translate'
import {withForwardedRef} from '~/ref'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './list.module.css'

class _ScrollableList extends React.Component {
    autoCenter$ = new Subject()

    constructor() {
        super()
        this.renderScrollable = this.renderScrollable.bind(this)
    }

    render() {
        const {className} = this.props
        return (
            <ElementResizeDetector resize$={this.autoCenter$}>
                <Scrollable
                    direction='y'
                    containerClassName={[className, styles.options].join(' ')}>
                    {this.renderScrollable}
                </Scrollable>
            </ElementResizeDetector>
        )
    }

    renderScrollable(scrollable) {
        const {...props} = this.props
        return (
            <List
                {...props}
                scrollable={scrollable}
                autoCenter$={this.autoCenter$}
            />
        )
    }
}

export const ScrollableList = compose(
    _ScrollableList,
    withSubscriptions(),
    withForwardedRef()
)

ScrollableList.propTypes = {
    options: PropTypes.arrayOf(
        PropTypes.shape({
            alias: PropTypes.any,
            disabled: PropTypes.any,
            group: PropTypes.any,
            indent: PropTypes.any,
            key: PropTypes.any,
            label: PropTypes.any,
            render: PropTypes.func,
            value: PropTypes.any
        })
    ).isRequired,
    onSelect: PropTypes.func.isRequired,
    air: PropTypes.any,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    autoCenter: PropTypes.any,
    autoHighlight: PropTypes.any,
    className: PropTypes.string,
    keyboard: PropTypes.any,
    noResults: PropTypes.string,
    overScroll: PropTypes.any,
    selectedValue: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onCancel: PropTypes.func
}

ScrollableList.defaultProps = {
    alignment: 'left',
    tooltipPlacement: 'right'
}

class _List extends React.Component {
    autoCenter$ = new Subject()
    mouseEnter$ = new Subject()
    mouseLeave$ = new Subject()

    state = {
        highlightedOptionKey: null,
        keyboardNavigation: true
    }

    constructor(props) {
        super(props)
        const {forwardedRef} = props
        this.list = forwardedRef || React.createRef()
        this.highlighted = React.createRef()
        this.selected = React.createRef()
        this.onMouseLeave = this.onMouseLeave.bind(this)
        this.selectHighlighted = this.selectHighlighted.bind(this)
        this.highlightPreviousOption = this.highlightPreviousOption.bind(this)
        this.highlightNextOption = this.highlightNextOption.bind(this)
        this.highlightFirstOption = this.highlightFirstOption.bind(this)
        this.highlightLastOption = this.highlightLastOption.bind(this)
    }

    render() {
        const {scrollable: {clientHeight}, onCancel, keyboard} = this.props
        const keymap = {
            Escape: onCancel ? onCancel : null,
            Enter: this.selectHighlighted,
            ArrowUp: this.highlightPreviousOption,
            ArrowDown: this.highlightNextOption,
            Home: this.highlightFirstOption,
            End: this.highlightLastOption
        }
        return (
            <Keybinding keymap={keymap} disabled={keyboard === false}>
                {this.renderList(clientHeight)}
            </Keybinding>
        )
    }

    renderList(clientHeight = 0) {
        const {overScroll} = this.props
        return (
            <ul
                onMouseLeave={this.onMouseLeave}
                ref={this.list}
                style={{
                    '--scrollable-container-height': overScroll ? clientHeight : 0
                }}>
                {this.renderOptions()}
            </ul>
        )
    }

    renderOptions() {
        const {options, noResults} = this.props
        return options.length
            ? options.map((option, index) => this.renderOption(option, index))
            : this.renderOption({label: noResults || msg('widget.list.noResults')})
    }

    renderOption(option, index) {
        return option.value !== undefined && !option.disabled
            ? this.renderSelectableOption(option, index)
            : option.group
                ? option.render || option.label
                    ? this.renderGroup(option, index)
                    : this.renderSeparator(option, index)
                : this.renderNonSelectableOption(option, index)
    }

    renderGroup(option, index) {
        const {alignment, air} = this.props
        return (
            <li key={option.key || index} className={styles.sticky} style={this.getOptionStyle(option)}>
                <Button
                    innerButton
                    chromeless
                    look='transparent'
                    air={air}
                    label={option.render ? option.render() : option.label}
                    labelStyle='smallcaps'
                    width='max'
                    alignment={alignment}
                    tail={this.renderGroupTooltipIcon(option)}
                />
            </li>
        )
    }

    renderGroupTooltipIcon({tooltip, tooltipLinkUrl}) {
        const {tooltipPlacement} = this.props
        return tooltip || tooltipLinkUrl ? (
            <Button
                innerButton
                chromeless
                shape='none'
                air='none'
                icon='info-circle'
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                linkUrl={tooltipLinkUrl}
            />
        ) : null
    }

    renderNonSelectableOption(option, index) {
        const {alignment, air} = this.props
        return (
            <li key={option.key || option.value || index} style={this.getOptionStyle(option)}>
                <Button
                    innerButton
                    chromeless
                    look='transparent'
                    air={air}
                    label={option.render ? option.render() : option.label}
                    width='max'
                    alignment={alignment}
                    disabled
                />
            </li>
        )
    }

    renderSeparator(option, index) {
        return (
            <li key={option.key || index} className={styles.separator} style={this.getOptionStyle(option)}/>
        )
    }

    renderSelectableOption(option, index) {
        const {tooltipPlacement, alignment, air} = this.props
        const {keyboardNavigation} = this.state
        const key = this.getOptionKey(option)
        const selected = this.isSelected(option)
        const highlighted = this.isHighlighted(option)
        const hover = keyboardNavigation
            ? highlighted
            : null // three-state: null = auto
        const ref = (selected && this.selected) || (highlighted && this.highlighted) || null
        return (
            <li key={key || index} ref={ref} style={this.getOptionStyle(option)}>
                <Button
                    innerButton
                    chromeless={!selected}
                    look={selected ? 'selected' : 'highlight'}
                    air={air}
                    dimmed={option.dimmed}
                    label={option.render ? null : option.label}
                    tooltip={option.tooltip}
                    tooltipPlacement={tooltipPlacement}
                    hover={hover}
                    width='max'
                    alignment={alignment}
                    disableTransitions
                    onMouseEnter={() => this.mouseEnter$.next(key)}
                    onClick={() => this.selectOption(key)}>
                    {option.render ? option.render() : null}
                </Button>
            </li>
        )
    }

    getOptionStyle(option) {
        return {
            '--indent': option.indent
        }
    }

    onMouseLeave() {
        this.mouseLeave$.next()
    }

    getOptionKey(option) {
        return option && (option.key || option.value || option.label)
    }

    isSelected(option) {
        const {selectedValue} = this.props
        return selectedValue && option.value === selectedValue && !option.alias
    }

    isSelectable(option) {
        return !option.group && option.value && !option.disabled
    }

    isHighlighted(option) {
        const {highlightedOptionKey} = this.state
        return highlightedOptionKey === this.getOptionKey(option)
    }

    selectHighlighted() {
        const {highlightedOptionKey} = this.state
        if (highlightedOptionKey) {
            this.selectOption(highlightedOptionKey)
        }
    }

    cancel() {
        const {onCancel} = this.props
        onCancel && onCancel()
    }

    getSelectedOption() {
        const {options, selectedValue} = this.props
        return selectedValue
            ? options.filter(({alias}) => !alias).find(({value}) => value === selectedValue)
            : null
    }

    getPreviousSelectableOptionKey(key) {
        const {options} = this.props
        const option = this.getOption(key)
        const index = _.indexOf(options, option)
        const previousIndex =
            index === -1
                ? options.length - 1
                : Math.max(index - 1, 0)
        return this.getOptionKey(_.findLast(options, option => this.isSelectable(option), previousIndex) || option)
    }

    getNextSelectableOptionKey(key) {
        const {options} = this.props
        const option = this.getOption(key)
        const nextIndex = Math.min(_.indexOf(options, option) + 1, options.length - 1)
        return this.getOptionKey(_.find(options, option => this.isSelectable(option), nextIndex) || option)
    }

    getFirstSelectableOptionKey() {
        const {options} = this.props
        return this.getOptionKey(_.find(options, option => this.isSelectable(option)))
    }

    getLastSelectableOptionKey() {
        const {options} = this.props
        return this.getOptionKey(_.findLast(options, option => this.isSelectable(option)))
    }

    highlightOption(highlightedOptionKey) {
        this.setState({
            highlightedOptionKey
        })
    }

    highlightPreviousOption() {
        this.setState(({highlightedOptionKey}) => ({
            highlightedOptionKey: this.getPreviousSelectableOptionKey(highlightedOptionKey),
            keyboardNavigation: true
        }), this.scrollHighlightedOption)
    }

    highlightNextOption() {
        this.setState(({highlightedOptionKey}) => ({
            highlightedOptionKey: this.getNextSelectableOptionKey(highlightedOptionKey),
            keyboardNavigation: true
        }), this.scrollHighlightedOption)
    }

    highlightFirstOption() {
        this.setState({
            highlightedOptionKey: this.getFirstSelectableOptionKey(),
            keyboardNavigation: true
        }, this.scrollHighlightedOption)
    }

    highlightLastOption() {
        this.setState({
            highlightedOptionKey: this.getLastSelectableOptionKey(),
            keyboardNavigation: true
        }, this.scrollHighlightedOption)
    }

    getOption(key) {
        const {options} = this.props
        return options.find(option => this.getOptionKey(option) === key)
    }

    selectOption(key) {
        const {onSelect} = this.props
        const option = this.getOption(key)
        option.onSelect && option.onSelect()
        onSelect && onSelect(option)
    }

    highlightSelectedOption() {
        const {autoHighlight} = this.props
        const selectedOption = this.getSelectedOption()
        const highlightedOptionKey = selectedOption
            ? this.getOptionKey(selectedOption)
            : (autoHighlight && this.getFirstSelectableOptionKey())
        this.setState({
            highlightedOptionKey,
            keyboardNavigation: true
        }, () => this.autoCenter$.next())
    }

    centerSelectedOption() {
        const {scrollable} = this.props
        scrollable.centerElement(this.selected.current)
    }
    
    scrollHighlightedOption() {
        const {scrollable} = this.props
        scrollable.scrollElement(this.highlighted.current)
    }

    initializeAutoCenter() {
        const {addSubscription, autoCenter$} = this.props
        addSubscription(
            merge(autoCenter$, this.autoCenter$)
                .subscribe(() => this.centerSelectedOption())
        )
        this.highlightSelectedOption()
    }

    initializeMouseHandler() {
        const {addSubscription} = this.props
        const mouseActivity$ = merge(
            fromEvent(document, 'mousemove'),
            fromEvent(document, 'wheel')
        )
        const mousePointOption$ = mouseActivity$.pipe(
            exhaustMap(() => this.mouseEnter$.pipe(
                first(),
                takeUntil(timer(500))
            )),
            distinctUntilChanged()
        )
        const mouseHighlightOption$ = mousePointOption$.pipe(
            debounceTime(100)
        )
        const mouseOut$ = this.mouseLeave$.pipe(
            switchMap(() => timer(500).pipe(
                takeUntil(this.mouseEnter$)
            ))
        )
        addSubscription(
            mousePointOption$.subscribe(
                () => this.disableKeyboardNavigation()
            ),
            mouseHighlightOption$.subscribe(
                key => this.highlightOption(key)
            ),
            mouseOut$.subscribe(
                () => this.highlightSelectedOption()
            )
        )
    }

    disableKeyboardNavigation() {
        this.setState(
            ({keyboardNavigation}) => (keyboardNavigation ? {keyboardNavigation: false} : null)
        )
    }

    componentDidMount() {
        this.initializeAutoCenter()
        this.initializeMouseHandler()
    }

    componentDidUpdate({options: prevOptions, selectedValue: prevSelectedValue}) {
        const {options, selectedValue} = this.props
        if (selectedValue !== prevSelectedValue || !isEqual(options, prevOptions)) {
            this.highlightSelectedOption()
        }
    }
}

const List = compose(
    _List,
    withSubscriptions()
)
