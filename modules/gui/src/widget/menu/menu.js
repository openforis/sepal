import {Icon} from '../icon'
import React from 'react'
import _ from 'lodash'
import styles from './menu.module.css'

export const Menu = ({children}) =>
    <ul className={styles.menu}>
        {children}
    </ul>

const Separator = () =>
    <div className={styles.separator}/>
Menu.Separator = Separator

const MenuItem = ({selected, label, description, right, onClick}) =>
    <li className={styles.item} onClick={() => {onClick && onClick()}}>
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

Menu.Item = MenuItem

const Toggle = ({label, description, onChange, selected = false, right}) => {
    return (
        <Menu.Item
            label={label}
            description={description}
            selected={selected}
            right={right}
            onClick={() => onChange(!selected)}/>)
}

Menu.Toggle = Toggle

const SelectContext = React.createContext()

const Select = ({label, selected, children, onSelect}) =>
    <SelectContext.Provider value={{
        selected,
        select: selected => onSelect(selected)
    }}>
        <div className={styles.group}>
            {label
                ? <li className={styles.groupLabel}>{label}</li>
                : null}
            <ul>
                {children}
            </ul>
        </div>
    </SelectContext.Provider>

Menu.Select = Select

const Option = ({id, label, description, right}) =>
    <SelectContext.Consumer>
        {({selected, select}) =>
            <Menu.Item
                label={label}
                description={description}
                selected={_.isArray(selected)
                    ? selected.includes(id)
                    : id === selected}
                right={right}
                onClick={() => select(id)}/>
        }
    </SelectContext.Consumer>

Menu.Option = Option
