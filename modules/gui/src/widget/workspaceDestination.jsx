import PropTypes from 'prop-types'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {toSafeString} from '~/string'
import {currentUser} from '~/user'
import {Form} from '~/widget/form'

const mapStateToProps = state => ({
    projects: selectFrom(state, 'process.projects')
})

const mapRecipeToProps = recipe => ({
    user: currentUser(),
    projectId: recipe.projectId,
    recipeName: recipe.title || recipe.placeholder
})

class _WorkspaceDestination extends React.Component {
    state = {
        currentType: undefined
    }

    constructor(props) {
        super(props)
        // this.onLoading = this.onLoading.bind(this)
        // this.onError = this.onError.bind(this)
    }

    render() {
        return this.renderInput()
        // const {currentType} = this.state
        // const showStrategy = ['Image', 'ImageCollection'].includes(currentType)
        // return showStrategy
        //     ? (
        //         <Layout spacing='tight'>
        //             {this.renderInput()}
        //             {this.renderStrategy()}
        //         </Layout>
        //     )
        //     : this.renderInput()
    }

    renderInput() {
        const {workspacePathInput, label, placeholder, autoFocus} = this.props
        return (
            <Form.Input
                input={workspacePathInput}
                label={label}
                placeholder={placeholder}
                autoFocus={autoFocus}
                // onLoading={this.onLoading}
                // onLoaded={({metadata} = {}) => this.onLoaded(metadata?.type)}
                // onError={this.onError}
            />
        )
    }

    // renderStrategy() {
    //     const {strategyInput, type} = this.props
    //     const {currentType} = this.state
    //     const options = [
    //         {
    //             value: 'resume',
    //             label: msg('widget.workspaceDestination.resume.label'),
    //             tooltip: msg('widget.workspaceDestination.resume.tooltip'),
    //             disabled: !currentType || type !== 'ImageCollection'
    //         },
    //         {
    //             value: 'replace',
    //             label: msg('widget.workspaceDestination.replace.label'),
    //             tooltip: msg('widget.workspaceDestination.replace.tooltip')
    //         }
    //     ].filter(({value}) => value !== 'resume' || type === 'ImageCollection')
    //     return (
    //         <Form.Buttons
    //             input={strategyInput}
    //             options={options}
    //             size='x-small'
    //             alignment='right'
    //             shape='pill'
    //             air='less'
    //         />
    //     )
    // }

    componentDidMount() {
        const {workspacePathInput} = this.props
        if (!workspacePathInput.value) {
            workspacePathInput.set(this.defaultWorkspacePath() || null)
        }
    }

    // componentDidUpdate(prevProps) {
    //     const {workspacePathInput, strategyInput, type} = this.props
    //     const {currentType} = this.state
    //     if (currentType && strategyInput.value && workspacePathInput.error) {
    //         workspacePathInput.setInvalid(null)
    //     }
    //     if (prevProps.type !== type && strategyInput.value === 'resume') {
    //         // Switching type and resume strategy, we have to reset it prevent invalid strategy
    //         strategyInput.set(null)
    //         this.onLoaded(currentType)
    //     }
    // }

    defaultWorkspacePath() {
        const {recipeName} = this.props
        const project = this.findProject()
        if (project?.defaultWorkspaceFolder) {
            return `${project?.defaultWorkspaceFolder}/${recipeName}`
        } else {
            if (project) {
                const projectDir = toSafeString(project?.name)
                return `downloads/${projectDir}/${recipeName}`
            } else {
                return `downloads/${recipeName}`
            }
        }
    }

    findProject() {
        const {projects, projectId} = this.props
        return projects.find(({id}) => id === projectId)
    }

    // onLoading() {
    //     const {strategyInput} = this.props
    //     strategyInput.set(null)
    //     this.setState({currentType: null})
    // }

    // onLoaded(currentType) {
    //     const {workspacePathInput, strategyInput} = this.props
    //     this.setState({currentType})
    //     if (currentType) {
    //         workspacePathInput.setInvalid(msg(
    //             ['Image', 'ImageCollection'].includes(currentType)
    //                 ? 'widget.workspaceDestination.exists.replaceable'
    //                 : 'widget.workspaceDestination.exists.notReplaceable'
    //         ))
    //     } else {
    //         strategyInput.set('new')
    //     }
    // }

    // onError(error) {
    //     const {workspacePathInput, onError} = this.props
    //     if (error.status === 404) {
    //         this.onLoaded()
    //     } else {
    //         onError && onError(error)
    //         workspacePathInput.setInvalid(
    //             error.response && error.response.messageKey
    //                 ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    //                 : msg('widget.workspacePathInput.loadError')
    //         )
    //     }
    // }
}

export const WorkspaceDestination = compose(
    _WorkspaceDestination,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps)
)

WorkspaceDestination.propTypes = {
    workspacePathInput: PropTypes.object.isRequired,
    // strategyInput: PropTypes.object.isRequired,
    // type: PropTypes.any.isRequired,
    label: PropTypes.any,
    placeholder: PropTypes.string,
    tooltip: PropTypes.any
}
