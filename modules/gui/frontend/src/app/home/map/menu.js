import React from 'react'
import Icon from 'widget/icon'
import {Panel} from 'widget/panel/panel'
import styles from './menu.module.css'


export const Menu = ({position, close, className, children}) =>
    <Panel
        type={position}
        className={className}>
        <MenuContext.Provider value={{close}}>
            <ul className={styles.menu}>
                {children}
            </ul>
        </MenuContext.Provider>
    </Panel>


const MenuContext = React.createContext()


const Separator = () =>
    <div className={styles.separator}/>
Menu.Separator = Separator


const Item = ({selected, label, description, right, onClick}) =>
    <MenuContext.Consumer>
        {({close}) => {
            return (
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
            )
        }}
    </MenuContext.Consumer>
Menu.Item = Item


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
const Select = ({label, selected, children, onSelect}) => {
    return (
        <SelectContext.Provider value={({
                selected,
                select: selected => onSelect(selected)
            }
        )}>
            <div className={styles.group}>
                <li className={styles.groupLabel}>{label}</li>
                <ul>
                    {children}
                </ul>
            </div>
        </SelectContext.Provider>
    )
}
Menu.Select = Select


const Option = ({id, label, description, right}) =>
    <SelectContext.Consumer>
        {({selected, select}) =>
            <Menu.Item
                label={label}
                description={description}
                selected={id === selected}
                right={right}
                onClick={() => select(id)}/>
        }
    </SelectContext.Consumer>
Menu.Option = Option