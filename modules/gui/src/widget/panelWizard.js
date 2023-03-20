import {compose} from 'compose'
import {withActivators} from 'widget/activation/activator'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const PanelWizardContext = React.createContext()

export const withPanelWizard = withContext(PanelWizardContext, 'panelWizard')

class PanelWizard extends React.Component {
    constructor(props) {
        super(props)
        this.state = {initialized: props.initialized}
    }

    render() {
        const {panels = [], activator: {activatables, updateActivatables}, onDone, children} = this.props
        const {initialized} = this.state

        const currentId = !initialized && _(activatables)
            .pickBy(({active}) => active)
            .keys()
            .find(id => panels.includes(id))
        const currentIndex = panels.indexOf(currentId)
        const currentActivatable = activatables[panels[currentIndex]]

        const inRange = index => index >= 0 && index < panels.length

        const navigate = index => {
            if (!inRange(index)) {
                return false
            }
            const id = panels[index]
            return activatables[id]
                ? () => updateActivatables([
                    {id: currentId, active: false},
                    {id, active: true}
                ])
                : false
        }

        const wizard = !initialized && panels
        const back = navigate(currentIndex - 1)
        const next = navigate(currentIndex + 1)

        const done = () => {
            this.setState({initialized: true})
            currentActivatable && currentActivatable.deactivate()
            onDone && onDone()
        }

        return (
            <PanelWizardContext.Provider value={{wizard, back, next, done}}>
                {children}
            </PanelWizardContext.Provider>
        )
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    update() {
        const {initialized = this.props.initialized} = this.state
        if (initialized || this.selectedFirst)
            return
        const {panels, activator: {activatables}} = this.props
        const isAnyActive = _(activatables)
            .pickBy(({active}) => active)
            .keys()
            .some(panels)
        if (!isAnyActive)
            this.selectFirstPanel()
    }

    selectFirstPanel() {
        const {panels, activator: {activatables}} = this.props
        const activatable = activatables[panels[0]]
        if (activatable) {
            this.selectedFirst = true
            activatable && activatable.activate()
        }
    }
}

export default compose(
    PanelWizard,
    withActivators()
)

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired,
    children: PropTypes.any,
    initialized: PropTypes.any,
    selectedPanel: PropTypes.any,
    onDone: PropTypes.func
}
