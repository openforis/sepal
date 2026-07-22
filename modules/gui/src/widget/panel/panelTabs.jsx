import PropTypes from 'prop-types'

import {Button} from '~/widget/button'

import styles from './panelTabs.module.css'

export const PanelTabs = ({tabs, selected, children, onSelect}) => (
    <>
        <div className={styles.tabs}>
            {tabs.map(({value, label, disabled, tooltip}) => {
                const active = value === selected
                return (
                    <Button
                        key={value}
                        additionalClassName={[styles.tab, active ? styles.selected : null].join(' ')}
                        look={active ? 'selected' : 'default'}
                        alignment='center'
                        air='more'
                        label={label}
                        labelStyle='smallcaps'
                        disabled={disabled}
                        tooltip={tooltip}
                        tooltipAllowedWhenDisabled
                        tooltipPlacement='right'
                        onClick={() => onSelect(value)}
                    />
                )
            })}
        </div>
        {children}
    </>
)

PanelTabs.propTypes = {
    children: PropTypes.any.isRequired,
    selected: PropTypes.string.isRequired,
    tabs: PropTypes.arrayOf(PropTypes.shape({
        disabled: PropTypes.any,
        label: PropTypes.any.isRequired,
        tooltip: PropTypes.any,
        value: PropTypes.string.isRequired
    })).isRequired,
    onSelect: PropTypes.func.isRequired
}
