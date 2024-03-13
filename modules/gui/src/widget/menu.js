import {Button} from 'widget/button'
import {FloatingBox} from './floatingBox'
import {Keybinding} from './keybinding'
import {compose} from 'compose'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './menu.module.css'

const Context = React.createContext()

const withMenuContext = withContext(Context, 'menuContext')

class _MenuItem extends React.Component {
    constructor() {
        super()
        this.onClick = this.onClick.bind(this)
    }

    render() {
        const {children} = this.props
        return (
            <li className={styles.item} onClick={this.onClick}>
                {children}
            </li>
        )
    }

    onClick(e) {
        const {menuContext: {close}, onSelect} = this.props
        close()
        onSelect && onSelect(e)
    }
}

const MenuItem = compose(
    _MenuItem,
    withMenuContext()
)

MenuItem.propTypes = {
    children: PropTypes.any,
    onSelect: PropTypes.func
}

export class Menu extends React.Component {
    button = React.createRef()

    state = {
        open: false
    }

    constructor() {
        super()
        this.toggle = this.toggle.bind(this)
        this.close = this.close.bind(this)
    }

    toggle() {
        this.setState(({open}) => ({open: !open}))
    }

    close() {
        this.setState({open: false})
    }

    render() {
        const {disabled} = this.props
        const {open} = this.state
        return (
            <React.Fragment>
                <Button
                    ref={this.button}
                    chromeless
                    look='transparent'
                    size='large'
                    shape='circle'
                    icon='bars'
                    disabled={disabled}
                    hover={open === true ? true : undefined}
                    onClick={this.toggle}
                />
                {open ? this.renderMenu() : null}
            </React.Fragment>
        )
    }

    renderMenu() {
        const {children} = this.props
        return (
            <Keybinding keymap={{'Escape': this.close}}>
                <FloatingBox
                    element={this.button.current}
                    vPlacement='below'
                    hPlacement='over-left'
                    onBlur={this.close}>
                    <Context.Provider value={{close: this.close}}>
                        <ul className={styles.menu}>
                            {children}
                        </ul>
                    </Context.Provider>
                </FloatingBox>
            </Keybinding>
        )
    }
}

Menu.propTypes = {
    appDimensions: PropTypes.object,
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    onClick: PropTypes.func
}

Menu.Item = MenuItem
