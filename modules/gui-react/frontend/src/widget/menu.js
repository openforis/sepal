import PropTypes from 'prop-types'
import React from 'react'
import ReactDOM from 'react-dom'
import {connect, select} from 'store'
import Icon from 'widget/icon'
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
        this.setState(prevState => ({...prevState, open: !this.state.open}))
    }

    render() {
        const {children} = this.props
        const {open} = this.state
        return <React.Fragment>
            <button
                ref={this.button}
                className={[styles.menu, open ? styles.open : null].join(' ')}
                onClick={() => this.toggleOpen()}>
                <Icon name='bars'/>
            </button>
            {open
                ? ReactDOM.createPortal(
                    <React.Fragment>
                        <MenuContext.Provider value={this}>
                            <div className={styles.captureClicks} onClick={() => this.toggleOpen()}/>
                            <ul className={styles.list} style={this.menuStyle()}>
                                {children}
                            </ul>
                        </MenuContext.Provider>
                    </React.Fragment>,
                    document.body)
                : null}
        </React.Fragment>
    }
}

Menu.propTypes = {
    onClick: PropTypes.func,
    children: PropTypes.any
}

export default connect(mapStateToProps)(Menu)

const MenuContext = React.createContext()

export const MenuItem = ({onClick, children}) =>
    <MenuContext.Consumer>
        {(menu) =>
            <li className={styles.menuItem} onClick={(e) => {
                menu.toggleOpen()
                onClick && onClick(e)
            }}>{children}</li>
        }
    </MenuContext.Consumer>

MenuItem.propTypes = {
    onClick: PropTypes.func
}