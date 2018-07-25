import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import Icon from 'widget/icon'
import styles from './panel.module.css'
import {PanelButtonContext} from './toolbar'

export const Panel = ({top, bottom, right, left, center, modal, className, children}) =>
    <PanelButtonContext.Consumer>
        {panelButtonPosition => {
            top = top || (panelButtonPosition && panelButtonPosition.top)
            bottom = bottom || (panelButtonPosition && panelButtonPosition.bottom)
            right = right || (panelButtonPosition && panelButtonPosition.right)
            left = left || (panelButtonPosition && panelButtonPosition.left)
            const panel =
                <form className={[
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
            return modal
                ? <div className={styles.modal}>{panel}</div>
                : panel
        }}
    </PanelButtonContext.Consumer>

Panel.propTypes = {
    top: PropTypes.any,
    bottom: PropTypes.any,
    right: PropTypes.any,
    left: PropTypes.any,
    center: PropTypes.any,
    modal: PropTypes.any,
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


const mapStateToProps = (state, ownProps) => {
    const {statePath} = ownProps
    return {
        initialized: select([statePath, 'initialized']),
        selectedPanel: select([statePath, 'selectedPanel'])
    }
}

class PanelWizard extends React.Component {
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

PanelWizard = connect(mapStateToProps)(PanelWizard)
export {PanelWizard}

export const PanelWizardContext = React.createContext()
