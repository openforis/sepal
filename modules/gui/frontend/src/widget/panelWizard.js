import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withContext from 'context'

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
        const back = navigate(currentIndex - 1)
        const next = navigate(currentIndex + 1)

        const done = () => {
            this.setState({initialized: true})
            currentActivatable.deactivate()
            onDone && onDone()
        }
        return (
            <Context.Provider value={{wizard: !initialized && panels, back, next, done}}>
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
    activator()
)

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired,
    children: PropTypes.any,
    initialized: PropTypes.any,
    selectedPanel: PropTypes.any,
    onDone: PropTypes.func
}

const Context = React.createContext()

export const PanelWizardContext = ({children}) =>
    <Context.Consumer>
        {(value = {}) => children(value)}
    </Context.Consumer>

export const withPanelWizardContext = withContext(Context, 'wizardContext')
