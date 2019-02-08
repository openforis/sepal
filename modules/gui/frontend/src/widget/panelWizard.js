import actionBuilder from 'action-builder'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'

const mapStateToProps = (state, ownProps) => {
    const {statePath} = ownProps
    const initialized = Object.keys(ownProps).includes('initialized')
        ? ownProps.initialized
        : select([statePath, 'initialized'])

    return {
        initialized,
        selectedPanel: select([statePath, 'selectedPanel'])
    }
}

class PanelWizard extends React.Component {
    render() {
        const {panels = [], children} = this.props
        return (
            <PanelWizardContext.Provider value={panels}>
                {children}
            </PanelWizardContext.Provider>
        )
    }

    componentDidMount() {
        const {initialized, selectedPanel} = this.props
        if (!initialized && !selectedPanel)
            this.selectFirstPanel()
    }

    selectFirstPanel() {
        const {panels, statePath} = this.props
        actionBuilder('SELECT_PANEL', {name: panels[0]})
            .set([statePath, 'selectedPanel'], panels[0])
            .dispatch()
    }
}

export default connect(mapStateToProps)(PanelWizard)

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired,
    statePath: PropTypes.string.isRequired,
    children: PropTypes.any,
    initialized: PropTypes.any,
    selectedPanel: PropTypes.any
}

export const PanelWizardContext = React.createContext()
