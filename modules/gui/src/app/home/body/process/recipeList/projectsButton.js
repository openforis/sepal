import {Button} from 'widget/button'
import {Projects} from './projects'
import {SingleActivator} from 'widget/activation/singleActivator'
import {compose} from 'compose'
import {msg} from 'translate'
import {withActivator} from 'widget/activation/activator'
import React from 'react'
import _ from 'lodash'

class _ProjectsButton extends React.Component {
    render() {
        return (
            <React.Fragment>
                <Projects/>
                <SingleActivator id='projects'>
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
                </SingleActivator>
            </React.Fragment>
        )
    }
}

export const ProjectsButton = compose(
    _ProjectsButton,
    withActivator('projects')
)
