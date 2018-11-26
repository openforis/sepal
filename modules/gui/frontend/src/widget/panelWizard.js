import {connect, select} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'

const mapStateToProps = (state, ownProps) => {
    const {statePath} = ownProps
    return {
        initialized: select([statePath, 'initialized']),
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
        const {panels, statePath, initialized, selectedPanel} = this.props
        if (!initialized && !selectedPanel)
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
