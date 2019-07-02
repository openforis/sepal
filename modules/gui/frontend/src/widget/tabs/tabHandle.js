import {Button} from 'widget/button'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {compose} from 'compose'
import {renameTab, selectTab} from './tabs'
import {select} from 'store'
import {withScrollable} from 'widget/scrollable'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './tabHandle.module.css'

const CLOSE_ANIMATION_DURATION_MS = 250

const getTabIndex = (id, statePath) =>
    select([statePath, 'tabs']).findIndex(tab => tab.id === id)

const toTabPath = (id, statePath) =>
    [statePath, 'tabs', getTabIndex(id, statePath)].join('.')

class _TabHandle extends React.Component {
    constructor(props) {
        super(props)
        const {title = ''} = props
        this.state = {
            editing: false,
            title: title,
            prevTitle: title
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
        const {editing} = this.state
        return (
            <Layout
                type='horizontal-nowrap'
                spacing='none'
                className={[
                    styles.tab,
                    styles.regular,
                    selected ? styles.selected : null,
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
        const {placeholder, selected} = this.props
        const {title, editing} = this.state
        const keymap = {
            Enter: () => this.exitEditing(true),
            Escape: () => this.exitEditing(false),
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
                    onClick={() => selected
                        ? this.editTitle()
                        : this.selectTab()
                    }
                    onChange={e => this.onTitleChange(e)}
                    onBlur={() => this.exitEditing(true)}/>
            </Keybinding>
        )
    }

    renderCloseButton() {
        const {onClose} = this.props
        return (
            <Button
                chromeless
                look='cancel'
                size='small'
                shape='none'
                icon='times'
                message='message'
                onClick={() => onClose()}
            />
        )
    }

    selectTab() {
        const {id, statePath} = this.props
        selectTab(id, statePath)
    }

    editTitle() {
        this.setState({editing: true}, () => this.focus())
    }

    onTitleChange(e) {
        const value = e.target.value.replace(/[^\w-.]/g, '_')
        // e.target.value = value
        this.setState({title: value})
    }

    exitEditing(save) {
        const {editing} = this.state
        if (editing) {
            if (save) {
                this.saveTitle()
            } else {
                this.restoreTitle()
            }
        }
    }

    saveTitle() {
        const {id, statePath, onTitleChanged} = this.props
        const {title} = this.state
        const tabPath = toTabPath(id, statePath)
        const selectTab = () => select(tabPath)
        const prevTitle = selectTab().title
        if (prevTitle !== title) {
            renameTab(title, tabPath, onTitleChanged)
        }
        this.setState({
            prevTitle: title,
            editing: false
        }, this.blur)
    }

    restoreTitle() {
        const {prevTitle} = this.state
        this.setState({
            title: prevTitle,
            editing: false
        }, this.blur)
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
    withScrollable()
)

TabHandle.propTypes = {
    closing: PropTypes.any,
    id: PropTypes.string,
    placeholder: PropTypes.string,
    selected: PropTypes.any,
    statePath: PropTypes.string,
    title: PropTypes.string,
    onTitleChanged: PropTypes.func
}
