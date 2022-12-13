import {Activator, withActivator} from 'widget/activation/activator'
import {Button} from 'widget/button'
import {Projects} from './projects'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import _ from 'lodash'

class _ProjectsButton extends React.Component {
    render() {
        return (
            <React.Fragment>
                <Projects/>
                <Activator id='projects'>
                    {({active, activate}) =>
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
                    }
                </Activator>
            </React.Fragment>
        )
    }
}

export const ProjectsButton = compose(
    _ProjectsButton,
    withActivator('projects')
)
