import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {select} from '~/store'
import {toSafeString} from '~/string'
import {withSubscriptions} from '~/subscription'
import {Button} from '~/widget/button'
import {Input} from '~/widget/input'
import {Keybinding} from '~/widget/keybinding'
import {Layout} from '~/widget/layout'
import {withScrollable} from '~/widget/scrollable'

import {renameTab, selectTab} from './tabActions'
import styles from './tabHandle.module.css'

const CLOSE_ANIMATION_DURATION_MS = 250
const ADD_ANIMATION_DURATION_MS = 200 // matches .tab.regular.add in tabHandle.module.css

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
            busy: false,
            animateAdd: true
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
        const {selected, closing, dragging} = this.props
        const {busy, editing, animateAdd} = this.state
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
                    editing ? styles.editing : null,
                    dragging ? styles.dragging : null,
                    animateAdd && !dragging ? styles.add : null
                ].join(' ')}
                style={{'--close-animation-duration': `${CLOSE_ANIMATION_DURATION_MS}ms`}}>
                {this.renderPrefix()}
                {this.renderInput()}
                {this.renderCloseButton()}
            </Layout>
        )
    }

    // Non-editable marker (e.g. the app tab's instance number, "2:") rendered outside
    // the title input so renaming the tab cannot eat or duplicate it.
    renderPrefix() {
        const {prefix} = this.props
        return prefix
            ? <div className={styles.prefix}>{prefix}</div>
            : null
    }

    renderInput() {
        const {placeholder, prefix} = this.props
        const {title, editing} = this.state
        const keymap = {
            Enter: this.saveTitle,
            Escape: this.restoreTitle,
        }
        return (
            <Keybinding keymap={keymap} disabled={!editing}>
                {/* No autoFocus: the input is readOnly until editing (which focuses explicitly
                    via onClick), and mount-time focus stole focus from open modals — e.g.
                    closing an app tab remounted an untitled tab handle, whose focus grab made
                    the UserReport panel's BlurDetector close it. */}
                <Input
                    ref={this.titleInput}
                    className={styles.title}
                    value={title}
                    placeholder={placeholder}
                    border={false}
                    readOnly={!editing}
                    tooltip={[prefix, title || placeholder].filter(Boolean).join(' ')}
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
        const prevTitle = tab.title || ''
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
        if (!inputElement)
            return
        const tabElement = inputElement.closest(`.${styles.tab}`)
        if (!tabElement)
            return
        scrollable.scrollElement(tabElement)
    }

    componentDidMount() {
        const {id, tabBusy$, addSubscription} = this.props
        addSubscription(
            tabBusy$(id).subscribe(
                ({busy}) => setImmediate(() => this.setState({busy}))
            )
        )
        this.scrollSelectedTabIntoView()
        // drop the add-animation class once it has played — see tabHandle.module.css
        this.addAnimationTimeout = setTimeout(() => this.setState({animateAdd: false}), ADD_ANIMATION_DURATION_MS)
    }

    componentWillUnmount() {
        clearTimeout(this.addAnimationTimeout)
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
    closing: PropTypes.any,
    dragging: PropTypes.any,
    id: PropTypes.string,
    placeholder: PropTypes.string,
    prefix: PropTypes.string,
    selected: PropTypes.any,
    statePath: PropTypes.string,
    tabBusy$: PropTypes.func,
    title: PropTypes.string,
    onTitleChanged: PropTypes.func
}
