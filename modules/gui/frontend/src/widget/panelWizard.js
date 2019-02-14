import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {activator} from 'widget/activation'

class PanelWizard extends React.Component {

    constructor(props) {
        super(props)
        this.state = {initialized: props.initialized}
    }

    render() {
        const {panels = [], activatables, children} = this.props
        const {initialized} = this.state
        const currentId = !initialized && _(activatables)
            .pickBy(({active}) => active)
            .keys()
            .find(id => panels.includes(id))
        const currentIndex = panels.indexOf(currentId)
        const currentActivatable = activatables[panels[currentIndex]]
        const inRange = (index) => index >= 0 && index < panels.length
        const navigate = (index) => {
            if (!inRange(index))
                return false
            const activatable = activatables[panels[index]]
            if (!activatable)
                return false
            return () => {
                currentActivatable.deactivate()
                activatable.activate()
            }
        }
        const back = navigate(currentIndex - 1)
        const next = navigate(currentIndex + 1)
        const done = () => {
            this.setState(prevState => ({...prevState, initialized: true}))
            currentActivatable.deactivate()
        }
        return (
            <Context.Provider value={{wizard: !initialized, back, next, done}}>
                {children}
            </Context.Provider>
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
        const {panels, activatables} = this.props
        const isAnyActive = _(activatables)
            .pickBy(({active}) => active)
            .keys()
            .some(panels)
        if (!isAnyActive)
            this.selectFirstPanel()
    }

    selectFirstPanel() {
        const {panels, activatables} = this.props
        const activatable = activatables[panels[0]]
        if (activatable) {
            this.selectedFirst = true
            activatable && activatable.activate()
        }
    }
}

export default activator()(PanelWizard)

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired,
    initialized: PropTypes.any.isRequired,
    children: PropTypes.any,
    selectedPanel: PropTypes.any
}

const Context = React.createContext()

export const PanelWizardContext = ({children}) =>
    <Context.Consumer>
        {(value = {}) => children(value)}
    </Context.Consumer>


