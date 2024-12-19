import {post$} from '~/http-client'

export default {

    login$: ({email, password}) =>
        post$('/api/ceo-gateway/login-token', {
            body: {email, password},
            maxRetries: 1,
        }),
     
    getAllInstitutions$: ({token}) =>
        post$('/api/ceo-gateway/get-all-institutions', {
            body: {token},
        }),
        
    getInstitutionProjects$: ({token, institutionId}) =>
        post$('/api/ceo-gateway/get-institution-projects', {
            body: {token, institutionId},
        }),
    
    getProjectData$: ({token, projectId, csvType}) =>
        post$('/api/ceo-gateway/get-project-data', {
            body: {token, projectId, csvType},
            responseType: 'text',
        })
}
