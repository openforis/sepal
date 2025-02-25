import {get$, post$} from '~/http-client'

export default {

    login$: ({email, password}) =>
        post$('/api/ceo-gateway/login-token', {
            body: {email, password},
            maxRetries: 1,
        }),
     
    getAllInstitutions$: ({token}) =>
        get$('/api/ceo-gateway/get-all-institutions', {
            headers: {'x-ceo-token': token},
        }),
        
    getInstitutionProjects$: ({token, institutionId}) =>
        get$('/api/ceo-gateway/get-institution-projects', {
            headers: {'x-ceo-token': token},
            query: {institutionId},
        }),
    
    getProjectData$: ({token, projectId, csvType}) =>
        get$('/api/ceo-gateway/get-project-data', {
            headers: {'x-ceo-token': token},
            query: {projectId, csvType},
            responseType: 'text',
        })
}
