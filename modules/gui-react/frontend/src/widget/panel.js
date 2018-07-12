import PropTypes from 'prop-types'
import React from 'react'
import Icon from 'widget/icon'
import styles from './panel.module.css'
import {PanelButtonContext} from './toolbar'

export const Panel = ({top, bottom, right, left, className, children}) =>
    <PanelButtonContext.Consumer>
        {panelButtonPosition => {
            top = top || (panelButtonPosition && panelButtonPosition.top)
            bottom = bottom || (panelButtonPosition && panelButtonPosition.bottom)
            right = right || (panelButtonPosition && panelButtonPosition.right)
            left = left || (panelButtonPosition && panelButtonPosition.left)
            return <div className={[
                styles.panel,
                top || !bottom ? styles.top : null,
                bottom ? styles.bottom : null,
                right || !left ? styles.right : null,
                left ? styles.bottom : null,
                className
            ].join(' ')}>
                {children}
            </div>
        }
        }
    </PanelButtonContext.Consumer>

Panel.propTypes = {
    top: PropTypes.any,
    bottom: PropTypes.any,
    right: PropTypes.any,
    left: PropTypes.any,
    className: PropTypes.string,
    children: PropTypes.any.isRequired
}


export const PanelHeader = ({icon, title, onBack}) =>
    <div className={styles.header}>
        <Icon name={icon}/>
        {title}
    </div>

PanelHeader.propTypes = {
    title: PropTypes.string,
    icon: PropTypes.string
}


export const PanelContent = ({children}) =>
    <div className={styles.content}>
        {children}
    </div>


export const PanelWizard = ({panels, children}) =>
    (
        <PanelWizardContext.Provider value={panels}>
            {children}
        </PanelWizardContext.Provider>
    )

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired
}

export const PanelWizardContext = React.createContext()

const SectionedFormPanel = ({section, forms}) =>
    <Panel>
    </Panel>


// const Foo = () => {
//     const sections = [
//         {
//             title: 'Area of interest',
//             component: <SectionSelection/>
//         },
//         {
//             section: 'country',
//             title: 'Select country/province',
//             component: <CountrySection/>
//         },
//     ]
//     return <SectionedFormPanel input={inputs.section} sections={sections}/>
// }