import Icon from 'widget/icon'
import React from 'react'
import styles from './menuItem.module.css'

const MenuContext = require('./menuContext')

export const MenuItem = ({selected, label, description, right, onClick}) =>
    <MenuContext.Consumer>
        {({close}) => (
            <li className={styles.item} onClick={() => {
                close && close()
                onClick()
            }}>
                <div className={styles.left}>
                    {selected
                        ? <Icon name={'check'}/>
                        : null
                    }
                </div>
                <div className={styles.center}>
                    <div className={styles.label}>{label}</div>
                    <div className={styles.description}>{description}</div>
                </div>
                <div className={styles.right}>
                    {right}
                </div>
            </li>
        )}
    </MenuContext.Consumer>
