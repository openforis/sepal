import React from 'react'
import styles from './menu.module.css'
import Icon from 'widget/icon'

class Menu extends React.Component {
    render() {
        return (
            <button
                className={styles.menu}>
                <Icon name='bars'/>
            </button>
        )
    }
}

export default Menu