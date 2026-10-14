import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {withContext} from '~/context'
import {withActivators} from '~/widget/activation/activator'

const Context = React.createContext()

export const withPanelWizard = withContext(Context, 'panelWizard')

// Leads a recipe being set up through its panels in order, until done. While it does, it knows which panels have been
// opened - its steps reached so far, and any other panel opened meanwhile - so what the toolbar says about a section
// can wait until it is reached (`reached`). That progress is the wizard's alone, kept while it is shown and never saved;
// once done, or for a recipe already set up, every panel counts as reached.
class _PanelWizard extends React.Component {
    constructor(props) {
        super(props)
        this.state = {initialized: props.initialized, opened: []}
    }

    static getDerivedStateFromProps({activator: {activatables}}, {initialized, opened}) {
        const newlyOpened = initialized ? [] : activeIds(activatables).filter(id => !opened.includes(id))
        return newlyOpened.length ? {opened: [...opened, ...newlyOpened]} : null
    }

    render() {
        const {panels = [], activator: {activatables, updateActivatables}, onDone, children} = this.props
        const {initialized, opened} = this.state

        const currentId = !initialized && activeIds(activatables)
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
        const reached = id => !wizard || opened.includes(id)
        const back = navigate(currentIndex - 1)
        const next = navigate(currentIndex + 1)

        const done = () => {
            this.setState({initialized: true})
            currentActivatable && currentActivatable.deactivate()
            onDone && onDone()
        }

        return (
            <Context.Provider value={{wizard, back, next, done, reached}}>
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

const activeIds = activatables =>
    _(activatables)
        .pickBy(({active}) => active)
        .keys()
        .value()

export const PanelWizard = compose(
    _PanelWizard,
    withActivators()
)

PanelWizard.propTypes = {
    panels: PropTypes.array.isRequired,
    children: PropTypes.any,
    initialized: PropTypes.any,
    selectedPanel: PropTypes.any,
    onDone: PropTypes.func
}
