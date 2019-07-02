import {Button} from 'widget/button'
import {compose} from 'compose'
import {connect, select} from 'store'
import Icon from 'widget/icon'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './menu.module.css'

const mapStateToProps = () => ({
    appDimensions: select('dimensions')
})

class Menu extends React.Component {
    state = {}
    button = React.createRef()

    menuStyle() {
        const {appDimensions} = this.props
        const buttonPosition = this.button.current.getBoundingClientRect()
        const maxHeight = appDimensions.height - buttonPosition.bottom - 10
        const width = '20rem'

        return {
            top: buttonPosition.bottom,
            left: `calc(${buttonPosition.right}px - ${width})`,
            right: buttonPosition.right,
            width,
            maxWidth: width,
            height: 'fit-content',
            maxHeight,
        }
    }

    toggleOpen() {
        this.setState(({open}) => ({open: !open}))
    }

    render() {
        const {warning, disabled, children} = this.props
        const {open} = this.state
        return <React.Fragment>
            <span ref={this.button}>
                <Button
                    chromeless
                    look='transparent'
                    size='large'
                    shape='circle'
                    icon='bars'
                    additionalClassName={warning ? styles.warning : null}
                    disabled={disabled}
                    onClick={() => this.toggleOpen()}/>
            </span>
            {open
                ? <Portal type='global'>
                    <MenuContext.Provider value={this}>
                        <div className={styles.captureClicks} onClick={() => this.toggleOpen()}/>
                        <ul className={styles.list} style={this.menuStyle()}>
                            {warning ?
                                <li className={styles.warning}>
                                    <Icon name='exclamation-triangle'/>
                                    {warning}
                                </li>
                                : null}
                            {children}
                        </ul>
                    </MenuContext.Provider>
                </Portal>
                : null}
        </React.Fragment>
    }
}

Menu.propTypes = {
    appDimensions: PropTypes.object,
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    warning: PropTypes.any,
    onClick: PropTypes.func
}

export default compose(
    Menu,
    connect(mapStateToProps)
)

const MenuContext = React.createContext()

export const MenuItem = ({onSelect, children}) =>
    <MenuContext.Consumer>
        {menu =>
            <li className={styles.menuItem} onClick={e => {
                menu.toggleOpen()
                onSelect && onSelect(e)
            }}>{children}</li>
        }
    </MenuContext.Consumer>

MenuItem.propTypes = {
    children: PropTypes.any,
    onSelect: PropTypes.func
}
