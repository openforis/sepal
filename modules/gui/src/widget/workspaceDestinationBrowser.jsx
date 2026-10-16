import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {FileTree} from '~/app/home/body/browse/files/fileTree'
import {UserFilesMonitor} from '~/app/home/body/browse/files/userFilesMonitor'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Notifications} from '~/widget/notifications'

import {withActivatable} from './activation/activatable'
import {ButtonPopup} from './buttonPopup'
import {CrudItem} from './crudItem'
import {Input} from './input'
import {ScrollableList} from './list'
import {Panel} from './panel/panel'
import {SearchBox} from './searchBox'
import {Widget} from './widget'
import styles from './workspaceDestinationBrowser.module.css'
import {destinationName, foldersToMonitor, joinPath, parentFolderPath, toFolderPath, visibleFolders} from './workspaceFolders'

const fields = {
    path: new Form.Field().notBlank()
}

const mapStateToProps = (_state, ownProps) => ({
    values: {
        path: ownProps?.activatable?.activatables?.workspaceBrowser?.activationProps?.path
    }
})

class _WorkspaceDestinationBrowser extends React.Component {
    input = React.createRef()
    monitor = new UserFilesMonitor()

    state = {
        tree: FileTree.create(),
        filter: '',
        selectedFolder: []
    }

    constructor(props) {
        super(props)
        this.onInputChange = this.onInputChange.bind(this)
        this.onFolderSelect = this.onFolderSelect.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.onApply = this.onApply.bind(this)
        this.onFolderUpdate = this.onFolderUpdate.bind(this)
    }

    render() {
        const {form, activatable: {deactivate}} = this.props
        const {filter} = this.state
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                onApply={this.onApply}
                onCancel={deactivate}>
                <Panel.Header title={msg('widget.workspaceDestination.browser.title')}/>
                <Panel.Content scrollable={false}>
                    <Widget
                        label={msg('widget.workspaceDestination.browser.path')}
                        layout='vertical-fill'
                        spacing='compact'>
                        {this.renderInput()}
                        {this.renderFolderTree()}
                        {this.renderFilter()}
                    </Widget>
                </Panel.Content>
                <Form.PanelButtons disabledEscape={!!filter}>
                    {this.renderCreateFolderButton()}
                </Form.PanelButtons>
            </Form.Panel>
        )
    }

    renderInput() {
        const {form, inputs: {path}} = this.props
        return (
            <Input
                ref={this.input}
                errorMessage={form.getErrorMessage(path)}
                value={path.value}
                onChange={this.onInputChange}
            />
        )
    }

    renderFolderTree() {
        const {tree, filter, selectedFolder} = this.state
        const options = [
            this.getHomeOption(),
            ...visibleFolders({tree, selectedFolder, filter}).map(folderPath => this.getFolderOption(folderPath))
        ]
        return (
            <ScrollableList
                options={options}
                selectedValue={toOptionValue(selectedFolder)}
                onSelect={this.onFolderSelect}
                keyboard={false}
            />
        )
    }

    getHomeOption() {
        return {
            label: msg('widget.workspaceDestination.browser.home'),
            value: toOptionValue([]),
            path: [],
            render: () => this.renderItem({icon: 'house', description: msg('widget.workspaceDestination.browser.home')})
        }
    }

    getFolderOption(folderPath) {
        const name = folderPath.at(-1)
        return {
            label: name,
            value: toOptionValue(folderPath),
            path: folderPath,
            indent: folderPath.length,
            render: () => this.renderItem({icon: 'folder-open', description: name})
        }
    }

    renderItem({icon, description}) {
        const {filter} = this.state
        return (
            <CrudItem
                description={description}
                highlight={filter}
                icon={icon}
                iconVariant='info'
            />
        )
    }

    renderFilter() {
        return (
            <SearchBox
                placeholder={msg('widget.workspaceDestination.browser.filter.placeholder')}
                width='fill'
                onSearchValue={this.onFilterChange}
            />
        )
    }

    renderCreateFolderButton() {
        return (
            <ButtonPopup
                look='add'
                icon='folder-plus'
                label={msg('widget.workspaceDestination.browser.createFolder.label')}
                vPlacement='below'
                hPlacement='over-right'>
                {close => (
                    <Input
                        className={styles.createFolder}
                        autoFocus
                        placeholder={msg('widget.workspaceDestination.browser.createFolder.placeholder')}
                        onAccept={name => {
                            if (toFolderPath(name).length) {
                                this.createFolder(name)
                                close()
                            }
                        }}
                        onCancel={close}
                    />
                )}
            </ButtonPopup>
        )
    }

    componentDidMount() {
        const {addSubscription, activatable: {activatables: {workspaceBrowser: {activationProps: {path}}}}} = this.props
        addSubscription(this.monitor.subscribe(this.onFolderUpdate))
        this.updatePath(path)
    }

    componentDidUpdate(_prevProps, {tree: prevTree, selectedFolder: prevSelectedFolder}) {
        const {tree, selectedFolder} = this.state
        if (tree !== prevTree || selectedFolder !== prevSelectedFolder) {
            this.monitor.watch(foldersToMonitor(this.state))
        }
    }

    onInputChange({target: {value: path}}) {
        this.updatePath(path)
    }

    onFolderSelect({path: folderPath}) {
        this.selectFolder(folderPath)
        this.focusInput()
    }

    onFilterChange(filter) {
        this.setState({filter})
    }

    onApply() {
        const {inputs: {path: {value: path}}, onChange, activatable: {deactivate}} = this.props
        onChange && onChange(path)
        deactivate()
    }

    onFolderUpdate({path, items}) {
        this.setState(({tree}) => ({tree: FileTree.updateItem(tree, FileTree.fromStringPath(path), items)}))
    }

    createFolder(name) {
        const {addSubscription} = this.props
        const {selectedFolder} = this.state
        addSubscription(
            api.userFiles.createFolder$(joinPath(selectedFolder, name)).subscribe({
                next: ({path}) => {
                    const folderPath = FileTree.fromStringPath(path)
                    this.setState(({tree}) => ({tree: FileTree.addDirectory(tree, folderPath)}))
                    this.selectFolder(folderPath)
                },
                error: error => Notifications.error({
                    message: msg(error.status === 409
                        ? 'widget.workspaceDestination.browser.createFolder.existing.error'
                        : 'widget.workspaceDestination.browser.createFolder.error'
                    ),
                    error: error.status === 409 ? undefined : error,
                    timeout: 5
                })
            })
        )
    }

    selectFolder(folderPath) {
        const {inputs: {path}} = this.props
        path.set(joinPath(folderPath, destinationName(path.value)))
        this.setSelectedFolder(folderPath)
    }

    updatePath(value) {
        const {inputs: {path}} = this.props
        path.set(value)
        this.setSelectedFolder(parentFolderPath(value))
    }

    setSelectedFolder(folderPath) {
        this.setState({selectedFolder: folderPath})
    }

    focusInput() {
        this.input.current?.focus()
    }
}

const toOptionValue = folderPath =>
    `/${FileTree.toStringPath(folderPath)}`

const policy = () => ({
    _: 'allow'
})

export const WorkspaceDestinationBrowser = compose(
    _WorkspaceDestinationBrowser,
    withSubscriptions(),
    withForm({fields, mapStateToProps}),
    withActivatable({id: 'workspaceBrowser', policy, alwaysAllow: true})
)

WorkspaceDestinationBrowser.propTypes = {
    onChange: PropTypes.func.isRequired
}
