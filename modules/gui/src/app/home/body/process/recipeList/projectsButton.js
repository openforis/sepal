import {Button} from '~/widget/button'
import {Projects} from './projects'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import React from 'react'
import _ from 'lodash'

class _ProjectsButton extends React.Component {
    render() {
        return (
            <React.Fragment>
                <Projects/>
                {this.renderActivator()}
            </React.Fragment>
        )
    }

    renderActivator() {
        const {activator: {activatables: {projects: {active, activate}}}} = this.props
        return (
            <Button
                look='transparent'
                shape='pill'
                icon='folder-tree'
                label={msg('process.projects.label')}
                tooltip={msg('process.projects.tooltip')}
                tooltipPlacement='top'
                tooltipDisabled={active}
                disabled={active}
                onClick={activate}
            />
        )
    }
}

export const ProjectsButton = compose(
    _ProjectsButton,
    withActivators('projects')
)
