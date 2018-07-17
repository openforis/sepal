import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'
import React from 'react'
import Icon from 'widget/icon'
import styles from './panel.module.css'
import {PanelButtonContext} from './toolbar'

export const Panel = ({top, bottom, right, left, center, className, children}) =>
    <PanelButtonContext.Consumer>
        {panelButtonPosition => {
            top = top || (panelButtonPosition && panelButtonPosition.top)
            bottom = bottom || (panelButtonPosition && panelButtonPosition.bottom)
            right = right || (panelButtonPosition && panelButtonPosition.right)
            left = left || (panelButtonPosition && panelButtonPosition.left)
            return <form className={[
                styles.panel,
                top ? styles.top : null,
                bottom ? styles.bottom : null,
                right ? styles.right : null,
                left ? styles.bottom : null,
                center ? styles.center : null,
                className
            ].join(' ')}>
                {children}
            </form>
        }}
    </PanelButtonContext.Consumer>

Panel.propTypes = {
    top: PropTypes.any,
    bottom: PropTypes.any,
    right: PropTypes.any,
    left: PropTypes.any,
    center: PropTypes.any,
    className: PropTypes.string,
    children: PropTypes.any.isRequired
}


export const PanelHeader = ({icon, title, children}) =>
    <div className={styles.header}>
        {children
            ? children
            : <React.Fragment>
                <Icon name={icon}/>
                {title}
            </React.Fragment>
        }
    </div>

PanelHeader.propTypes = {
    title: PropTypes.string,
    icon: PropTypes.string,
    children: PropTypes.any,
}


export const PanelContent = ({className, children}) =>
    <div className={[styles.content, className].join(' ')}>
        {children}
    </div>


PanelContent.propTypes = {
    className: PropTypes.string,
    children: PropTypes.any.isRequired,
}

export class PanelWizard extends React.Component {
    render() {
        const {panels, children} = this.props
        return <PanelWizardContext.Provider value={panels}>
            {children}
        </PanelWizardContext.Provider>
    }

    componentDidMount() {
        const {panels, statePath, selectedPanel, initialized} = this.props
        if (!initialized && !selectedPanel)
            actionBuilder('SELECT_PANEL', {name: panels[0]})
                .set([statePath, 'selectedPanel'], panels[0])
                .dispatch()
    }
}

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired,
    statePath: PropTypes.string.isRequired
}

export const PanelWizardContext = React.createContext()
