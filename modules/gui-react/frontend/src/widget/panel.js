import {PanelButtonContext} from './toolbar'
import {connect, select} from 'store'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import styles from './panel.module.css'

export const Panel = ({top, bottom, right, left, center, inline, modal, form = true, className, children}) =>
    <PanelButtonContext.Consumer>
        {panelButtonPosition => {
            top = top || (panelButtonPosition && panelButtonPosition.top)
            bottom = bottom || (panelButtonPosition && panelButtonPosition.bottom)
            right = right || (panelButtonPosition && panelButtonPosition.right)
            inline = inline || (panelButtonPosition && panelButtonPosition.inline)
            const classNames = [
                styles.panel,
                top ? styles.top : null,
                bottom ? styles.bottom : null,
                right ? styles.right : null,
                left ? styles.bottom : null,
                center ? styles.center : null,
                inline ? styles.inline : null,
                className
            ].join(' ')
            const panel = form
                ? <form className={classNames}>{children}</form>
                : <div className={classNames}>{children}</div>
            return modal
                ? <div className={styles.modal}>{panel}</div>
                : panel
        }}
    </PanelButtonContext.Consumer>

Panel.propTypes = {
    children: PropTypes.any.isRequired,
    bottom: PropTypes.any,
    center: PropTypes.any,
    className: PropTypes.string,
    form: PropTypes.any,
    inline: PropTypes.any,
    left: PropTypes.any,
    modal: PropTypes.any,
    right: PropTypes.any,
    top: PropTypes.any
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
    children: PropTypes.any,
    icon: PropTypes.string,
    title: PropTypes.string,
}

export const PanelContent = ({className, children}) =>
    <div className={[styles.content, className].join(' ')}>
        {children}
    </div>

PanelContent.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
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
    statePath: PropTypes.string.isRequired,
    children: PropTypes.any,
    initialized: PropTypes.any,
    selectedPanel: PropTypes.any
}

PanelWizard = connect(mapStateToProps)(PanelWizard)
export {PanelWizard}

export const PanelWizardContext = React.createContext()
