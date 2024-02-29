import {Button} from 'widget/button'
import {Input} from 'widget/input'
import {Keybinding} from 'widget/keybinding'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {filter} from 'rxjs'
import {renameTab, selectTab} from './tabs'
import {select} from 'store'
import {toSafeString} from 'string'
import {withScrollable} from 'widget/scrollable'
import {withSubscriptions} from 'subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './tabHandle.module.css'

const CLOSE_ANIMATION_DURATION_MS = 250

const getTabIndex = (id, statePath) =>
    select([statePath, 'tabs']).findIndex(tab => tab.id === id)

const toTabPath = (id, statePath) =>
    [statePath, 'tabs', getTabIndex(id, statePath)].join('.')

class _TabHandle extends React.Component {
    constructor(props) {
        super(props)
        this.onClick = this.onClick.bind(this)
        this.onTitleChange = this.onTitleChange.bind(this)
        this.saveTitle = this.saveTitle.bind(this)
        this.restoreTitle = this.restoreTitle.bind(this)
        this.focus = this.focus.bind(this)
        this.blur = this.blur.bind(this)
        const {title = ''} = props
        this.state = {
            editing: false,
            title,
            prevTitle: title,
            busy: false
        }
    }

    titleInput = React.createRef()

    static getDerivedStateFromProps(props, state) {
        const {editing} = state
        const title = editing
            ? state.title || ''
            : props.title || ''
        return {
            title
        }
    }

    render() {
        const {selected, closing} = this.props
        const {busy, editing} = this.state
        return (
            <Layout
                type='horizontal-nowrap'
                spacing='none'
                className={[
                    styles.tab,
                    styles.regular,
                    selected ? styles.selected : null,
                    busy ? styles.busy : null,
                    closing ? styles.closing : null,
                    editing ? styles.editing : null
                ].join(' ')}
                style={{'--close-animation-duration': `${CLOSE_ANIMATION_DURATION_MS}ms`}}>
                {this.renderInput()}
                {this.renderCloseButton()}
            </Layout>
        )
    }

    renderInput() {
        const {placeholder} = this.props
        const {title, editing} = this.state
        const keymap = {
            Enter: this.saveTitle,
            Escape: this.restoreTitle,
        }
        return (
            <Keybinding keymap={keymap} disabled={!editing}>
                <Input
                    ref={this.titleInput}
                    className={styles.title}
                    value={title}
                    placeholder={placeholder}
                    autoFocus={!title}
                    border={false}
                    readOnly={!editing}
                    tooltip={title || placeholder}
                    tooltipPlacement='bottom'
                    onClick={this.onClick}
                    onChange={this.onTitleChange}
                    onBlur={this.saveTitle}/>
            </Keybinding>
        )
    }

    renderCloseButton() {
        const {onClose} = this.props
        return (
            <Button
                chromeless
                look='default'
                size='small'
                shape='circle'
                air='less'
                icon='times'
                message='message'
                onClick={onClose}
            />
        )
    }

    onClick() {
        const {selected} = this.props
        selected
            ? this.editTitle()
            : this.selectTab()
    }

    onTitleChange(e) {
        const title = e.target.value
        this.setState({title})
    }

    selectTab() {
        const {id, statePath} = this.props
        selectTab(id, statePath)
    }

    editTitle() {
        this.setState({editing: true}, this.focus)
    }

    saveTitle() {
        const {id, statePath, onTitleChanged} = this.props
        const {editing, title} = this.state
        const normalizedTitle = toSafeString(title)
        this.titleInput.current.value = normalizedTitle
        const tabPath = toTabPath(id, statePath)
        const tab = select(tabPath)
        const prevTitle = tab.title
        if (editing) {
            if (!_.isEqual(prevTitle, normalizedTitle)) {
                renameTab(normalizedTitle, tabPath, onTitleChanged)
            }
            this.setState({
                prevTitle: normalizedTitle,
                editing: false
            }, this.blur)
        }
    }

    restoreTitle() {
        const {editing, prevTitle} = this.state
        if (editing) {
            this.setState({
                title: prevTitle,
                editing: false
            }, this.blur)
        }
    }

    focus() {
        this.titleInput.current.focus()
    }

    blur() {
        this.titleInput.current.blur()
    }

    scrollSelectedTabIntoView() {
        const {scrollable} = this.props
        const inputElement = this.titleInput.current
        const scrollableElement = scrollable && scrollable.getElement()
        if (!inputElement || !scrollableElement)
            return
        const tabElement = inputElement.closest(`.${styles.tab}`)
        if (!tabElement)
            return
        const tabLeft = tabElement.offsetLeft
        const tabWidth = tabElement.clientWidth
        const tabRight = tabLeft + tabWidth
        const scrollableWidth = scrollableElement.clientWidth
        const min = Math.max(tabRight + tabWidth / 2 - scrollableWidth, 0)
        const max = Math.max(tabLeft - tabWidth / 2, 0)
        const offset = scrollable.getOffset('x')
        if (offset < min) {
            scrollable.scrollTo(min, 'x')
        } else if (offset > max) {
            scrollable.scrollTo(max, 'x')
        }
    }

    componentDidMount() {
        const {id: tabId, busyOut$, addSubscription} = this.props
        addSubscription(
            busyOut$.pipe(
                filter(({tabId: currentTabId}) => currentTabId === tabId)
            ).subscribe(
                ({busy, _count}) => setImmediate(() => this.setState({busy}))
            )
        )
        this.scrollSelectedTabIntoView()
    }

    componentDidUpdate(prevProps) {
        const {selected} = this.props
        if (selected && prevProps.selected !== selected) {
            this.scrollSelectedTabIntoView()
        }
    }
}

export const TabHandle = compose(
    _TabHandle,
    withScrollable(),
    withSubscriptions()
)

TabHandle.propTypes = {
    busyOut$: PropTypes.any,
    closing: PropTypes.any,
    id: PropTypes.string,
    placeholder: PropTypes.string,
    selected: PropTypes.any,
    statePath: PropTypes.string,
    title: PropTypes.string,
    onTitleChanged: PropTypes.func
}
