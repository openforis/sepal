import {of, throwError} from 'rxjs'

import {projectTools} from '#mcp/chat/tools/projectTools'

import {aFakeGuiRequests, read, readError} from '../builders.js'

describe('project tools', () => {
    const context = {conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

    function toolNamed(name, guiRequests = aFakeGuiRequests()) {
        return projectTools(guiRequests).find(tool => tool.name === name)
    }

    describe('project_list', () => {

        it('exposes a no-argument schema', () => {
            expect(toolNamed('project_list').parameters).toEqual({
                type: 'object', properties: {}, additionalProperties: false
            })
        })

        it('asks the GUI to list projects, forwarding the subscription', () => {
            const guiRequests = aFakeGuiRequests(() => of([]))

            read(toolNamed('project_list', guiRequests).invoke$({}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                action: 'list-projects', params: {}
            }])
        })

        it('projects each project to id and name, dropping unknown fields', () => {
            const guiRequests = aFakeGuiRequests(() => of([
                {id: 'p1', name: 'Kenya', defaultAssetFolder: 'users/x', defaultWorkspaceFolder: '/home/x'}
            ]))

            const result = read(toolNamed('project_list', guiRequests).invoke$({}, context))

            expect(result).toEqual([{id: 'p1', name: 'Kenya'}])
        })

        it('lets a GUI failure propagate instead of returning an empty list', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI request failed')))

            const error = readError(toolNamed('project_list', guiRequests).invoke$({}, context))

            expect(error.message).toBe('GUI request failed')
        })
    })
})
