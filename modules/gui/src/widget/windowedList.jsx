import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {ListContent} from '~/widget/list'
import {Scrollable} from '~/widget/scrollable'

import fastListStyles from './fastList.module.css'
import listStyles from './list.module.css'

// A list of options as ScrollableList shows it, rendering only those in view and a few around them: for lists of
// thousands, which rendered whole would hold up everything else on the page. Options, navigation, highlighting and
// selection are the list's own (ListContent); every option stays there to reach, by scrolling, the keyboard or as the
// one selected.
//
// Space is reserved for the options not rendered, from their heights where they were measured and an average of those
// measured otherwise. Rows measure themselves as they are mounted (ResizeObserver), in one batch per frame; a change of
// width forgets what was measured. Reaching an option not rendered - by the keyboard, End or the option selected -
// jumps to where it is estimated to be, then to where its row is once mounted. Whatever corrects the estimates keeps in
// view what the view was brought to: the option jumped to, while the view stays where the jump left it, and otherwise
// the row at its top - each where it is mounted, by where it really is. The browser's own scroll anchoring is off, as
// it would undo that. The heading of the group the view is in stays at its top, rendered whether or not it is in view.

const OPTION = 'option'
const GROUP = 'group'
const SEPARATOR = 'separator'

// Before anything of its kind was measured.
const DEFAULT_HEIGHT = {[OPTION]: 40, [GROUP]: 34, [SEPARATOR]: 1}

// Rows rendered beyond the view on either side.
const OVERFLOW = 5

// Before the scrollable has measured itself.
const DEFAULT_VIEWPORT_HEIGHT = 600

class _ScrollableWindowedList extends React.Component {
    autoCenter$ = new Subject()

    constructor(props) {
        super(props)
        this.ref = React.createRef()
        this.renderScrollable = this.renderScrollable.bind(this)
    }

    render() {
        const {className} = this.props
        return (
            <ElementResizeDetector targetRef={this.ref} resize$={this.autoCenter$}>
                <Scrollable
                    ref={this.ref}
                    direction='y'
                    containerClassName={[className, listStyles.options].join(' ')}>
                    {this.renderScrollable}
                </Scrollable>
            </ElementResizeDetector>
        )
    }

    renderScrollable(scrollable) {
        return (
            <WindowedList
                {...this.props}
                scrollable={scrollable}
                autoCenter$={this.autoCenter$}
            />
        )
    }
}

export const ScrollableWindowedList = compose(
    _ScrollableWindowedList,
    withSubscriptions(),
    asFunctionalComponent({
        alignment: 'left',
        tooltipPlacement: 'right'
    })
)

ScrollableWindowedList.propTypes = {
    options: PropTypes.array.isRequired,
    onSelect: PropTypes.func.isRequired,
    air: PropTypes.any,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    autoHighlight: PropTypes.any,
    className: PropTypes.string,
    keyboard: PropTypes.any,
    noResults: PropTypes.string,
    overScroll: PropTypes.any,
    selectedValue: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onCancel: PropTypes.func
}

class _WindowedList extends ListContent {
    heights = new Map()
    totals = {[OPTION]: {sum: 0, count: 0}, [GROUP]: {sum: 0, count: 0}, [SEPARATOR]: {sum: 0, count: 0}}
    heightsVersion = 0
    layoutCache = null
    observed = new Set()
    measuredWidth = null

    renderList(clientHeight = 0) {
        const {options, overScroll} = this.props
        if (!options.length) {
            return super.renderList(clientHeight)
        }
        const layout = this.getLayout()
        const {start, end} = this.getWindow(layout)
        const header = layout.groupOf[start]
        const headerHeight = header >= 0 && header < start ? this.getHeight(options[header]) : 0
        this.headerCopy = headerHeight ? header : null
        return (
            <ul
                onMouseLeave={this.onMouseLeave}
                ref={this.list}
                style={{
                    '--scrollable-container-height': overScroll ? clientHeight : 0,
                    overflowAnchor: 'none'
                }}>
                {this.renderFiller('before', layout.offsets[start] - headerHeight)}
                {headerHeight ? this.renderRow(header) : null}
                {_.range(start, end).map(index => this.renderRow(index))}
                {this.renderFiller('after', layout.offsets[options.length] - layout.offsets[end])}
            </ul>
        )
    }

    renderRow(index) {
        const {options} = this.props
        return React.cloneElement(this.renderOption(options[index], index), {'data-window-index': index})
    }

    renderFiller(key, height) {
        return (
            <li
                key={key}
                aria-hidden
                className={fastListStyles.filler}
                style={{
                    '--height': Math.max(0, height),
                    '--itemHeight': this.getEstimate(OPTION)
                }}
            />
        )
    }

    // Offsets of every option from the top, and the heading of the group each lies in: recomputed only when the
    // options or what is known of their heights change, never as the list scrolls.
    getLayout() {
        const {options} = this.props
        const cache = this.layoutCache
        if (cache?.options === options && cache.version === this.heightsVersion) {
            return cache
        }
        const offsets = new Float64Array(options.length + 1)
        const groupOf = new Int32Array(options.length)
        let header = -1
        options.forEach((option, index) => {
            offsets[index + 1] = offsets[index] + this.getHeight(option)
            if (kindOf(option) === GROUP) {
                header = index
            }
            groupOf[index] = header
        })
        this.layoutCache = {options, version: this.heightsVersion, offsets, groupOf}
        return this.layoutCache
    }

    getWindow({offsets}) {
        const {options, scrollable: {scrollTop, clientHeight}} = this.props
        const top = this.getScrollTop(scrollTop)
        const viewportHeight = clientHeight || DEFAULT_VIEWPORT_HEIGHT
        return {
            start: Math.max(0, indexAt(offsets, top) - OVERFLOW),
            end: Math.min(options.length, indexAt(offsets, top + viewportHeight) + 1 + OVERFLOW)
        }
    }

    // Where the list is scrolled to now: a jump is rendered before the scrollable reports it.
    getScrollTop(reported = 0) {
        const element = this.props.scrollable.getElement?.()
        return element ? element.scrollTop : reported
    }

    getHeight(option) {
        const measured = this.heights.get(this.getOptionKey(option))
        return measured === undefined ? this.getEstimate(kindOf(option)) : measured
    }

    getEstimate(kind) {
        const {sum, count} = this.totals[kind]
        return count ? sum / count : DEFAULT_HEIGHT[kind]
    }

    componentDidMount() {
        super.componentDidMount()
        this.resizeObserver = new ResizeObserver(entries => this.onRowsResized(entries))
        this.observeRows()
    }

    componentDidUpdate(prevProps) {
        super.componentDidUpdate(prevProps)
        this.observeRows()
    }

    componentWillUnmount() {
        this.resizeObserver?.disconnect()
    }

    // The rows mounted now, and only those, are observed.
    observeRows() {
        const list = this.list.current
        if (!list || !this.resizeObserver) {
            return
        }
        this.observed.forEach(row => {
            if (!row.isConnected) {
                this.resizeObserver.unobserve(row)
                this.observed.delete(row)
            }
        })
        list.querySelectorAll(':scope > li[data-window-index]').forEach(row => {
            if (!this.observed.has(row)) {
                this.resizeObserver.observe(row)
                this.observed.add(row)
            }
        })
    }

    // One batch of rows measured, a change of width forgetting what was measured before: what the view was brought to
    // taken first, and kept once they are applied.
    onRowsResized(entries) {
        const {options, scrollable} = this.props
        const keep = this.getKept()
        const width = scrollable.getElement?.()?.clientWidth
        const widthChanged = !!width && this.measuredWidth !== null && width !== this.measuredWidth
        this.measuredWidth = width || this.measuredWidth
        if (widthChanged) {
            this.forgetHeights()
        }
        const changed = entries.filter(({target, borderBoxSize}) => {
            const option = options[Number(target.dataset.windowIndex)]
            const height = borderBoxSize?.[0]?.blockSize ?? target.offsetHeight
            return option && target.isConnected && this.setHeight(option, height)
        })
        if (widthChanged || changed.length) {
            this.heightsVersion++
            this.forceUpdate(keep)
        }
    }

    forgetHeights() {
        this.heights.clear()
        Object.values(this.totals).forEach(totals => Object.assign(totals, {sum: 0, count: 0}))
    }

    // What to restore once the estimates change: the option last jumped to, while the view stays where the jump left
    // it, otherwise the row at the top of the view. Taken before they change.
    getKept() {
        const jump = this.getJump()
        if (jump) {
            return () => this.scrollToIndex(jump.index, jump.align)
        }
        const anchor = this.getAnchor()
        return () => this.restoreAnchor(anchor)
    }

    // The option last jumped to, until the view is scrolled away from where the jump left it - other than by the list
    // getting shorter than it, which leaves the view at its end - or the options change.
    getJump() {
        const {options, scrollable} = this.props
        const jump = this.jump
        const element = scrollable.getElement?.()
        const top = this.getScrollTop()
        const left = Math.abs(top - jump?.scrollTop) >= 1
            && !(element && top < jump.scrollTop && top >= element.scrollHeight - element.clientHeight - 1)
        if (jump && !left && this.getOptionKey(options[jump.index]) === jump.key) {
            return jump
        }
        this.jump = null
        return null
    }

    setHeight(option, height) {
        const key = this.getOptionKey(option)
        const previous = this.heights.get(key)
        if (previous !== undefined && Math.abs(previous - height) < 0.5) {
            return false
        }
        const totals = this.totals[kindOf(option)]
        if (previous !== undefined) {
            totals.sum -= previous
            totals.count--
        }
        totals.sum += height
        totals.count++
        this.heights.set(key, height)
        return true
    }

    // The option at the top of the view, below the heading kept there, and how far into it the view starts, as a part
    // of its height: the same part of it starts the view whatever height it turns out to have. Read from the layout
    // last rendered: rows report new heights only once the browser has laid them out, so the rows themselves already
    // show the view as it is after the change.
    getAnchor() {
        const {options} = this.props
        if (!options.length) {
            return null
        }
        const {offsets} = this.getLayout()
        const top = this.getScrollTop() + this.getHeadingHeight()
        const index = indexAt(offsets, top)
        const height = offsets[index + 1] - offsets[index]
        return {key: this.getOptionKey(options[index]), index, within: height ? (top - offsets[index]) / height : 0}
    }

    restoreAnchor(anchor, refine = true) {
        const {options, scrollable} = this.props
        if (!anchor || this.getOptionKey(options[anchor.index]) !== anchor.key) {
            return
        }
        const box = this.getBox(anchor.index)
        const top = box.top + anchor.within * box.height - this.getHeadingHeight()
        if (Math.abs(top - this.getScrollTop()) >= 1) {
            scrollable.setScrollTop(top)
            this.forceUpdate(refine && !box.mounted ? () => this.restoreAnchor(anchor, false) : undefined)
        }
    }

    // Brings an option into view, by where its row is where it is mounted, otherwise by where it is estimated to be -
    // and where its row is once that has mounted it.
    scrollToIndex(index, align, refine = true) {
        const {options, scrollable} = this.props
        const element = scrollable.getElement?.()
        if (index < 0 || !element) {
            return
        }
        const {groupOf} = this.getLayout()
        const box = this.getBox(index)
        const viewportHeight = element.clientHeight
        const top = this.getScrollTop()
        const header = groupOf[index]
        const headerHeight = header >= 0 && header < index ? this.getHeight(options[header]) : 0
        const target = align === 'center'
            ? box.top - (viewportHeight - box.height) / 2
            : box.top - headerHeight < top
                ? box.top - headerHeight
                : box.top + box.height > top + viewportHeight
                    ? box.top + box.height - viewportHeight
                    : null
        if (target !== null) {
            scrollable.setScrollTop(Math.max(0, target))
            this.forceUpdate(refine && !box.mounted ? () => this.scrollToIndex(index, align, false) : undefined)
        }
        this.jump = {index, key: this.getOptionKey(options[index]), align, scrollTop: this.getScrollTop()}
    }

    // The height of the heading kept at the top of the view: that of the group the row at the top lies in, once that row
    // is beyond it.
    getHeadingHeight() {
        const {options} = this.props
        const {offsets, groupOf} = this.getLayout()
        const index = indexAt(offsets, this.getScrollTop())
        const header = groupOf[index]
        return header >= 0 && header < index ? this.getHeight(options[header]) : 0
    }

    // Where an option's row lies in the scrolled content and how high it is: as mounted, otherwise as estimated.
    getBox(index) {
        const mounted = this.getMountedRows().find(row => row.index === index)
        if (mounted) {
            return {...mounted.box, mounted: true}
        }
        const {offsets} = this.getLayout()
        return {top: offsets[index], height: offsets[index + 1] - offsets[index], mounted: false}
    }

    // The rows mounted in the window, in order, where they really are: none where nothing has a height to place.
    getMountedRows() {
        const list = this.list.current
        const element = this.props.scrollable.getElement?.()
        if (!list || !element) {
            return []
        }
        const contentTop = element.getBoundingClientRect().top - element.scrollTop
        return [...list.querySelectorAll(':scope > li[data-window-index]')]
            .map(row => ({row, index: Number(row.dataset.windowIndex)}))
            .filter(({row, index}) => index !== this.headerCopy && row.offsetHeight)
            .map(({row, index}) => ({index, box: {top: row.getBoundingClientRect().top - contentTop, height: row.offsetHeight}}))
    }

    scrollHighlightedOption() {
        const {options} = this.props
        const {highlightedOptionKey} = this.state
        this.scrollToIndex(options.findIndex(option => this.getOptionKey(option) === highlightedOptionKey), 'nearest')
    }

    centerSelectedOption() {
        const {options} = this.props
        const selected = this.getSelectedOption()
        if (selected) {
            this.scrollToIndex(options.indexOf(selected), 'center')
        }
    }
}

const WindowedList = compose(
    _WindowedList,
    withSubscriptions()
)

const kindOf = option =>
    option.group
        ? option.render || option.label ? GROUP : SEPARATOR
        : OPTION

// The last index whose offset is at or before a position.
const indexAt = (offsets, position) => {
    let low = 0
    let high = offsets.length - 2
    while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (offsets[middle] <= position) {
            low = middle
        } else {
            high = middle - 1
        }
    }
    return Math.max(0, low)
}
