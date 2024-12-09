import {of, throwError} from 'rxjs'
import {delay} from 'rxjs/operators'

// import {get$, post$} from '~/http-client'

const dummyUsers = [
    {email: 'd', password: 'd', token: 'tokenUser1', role: 'admin'},
    {email: 'f', password: 'f', token: 'tokenUser2', role: 'user'},
]
const dummyInstitutions = [
    {
        id: 3,
        name: 'NASA',
        isMember: false
    },
    {
        id: 4,
        name: 'US Forest Service',
        isMember: true
    },
    {
        id: 9,
        name: 'SERVIR SCO',
        isMember: false
    }
]

const dummyProjects = [
    {
        id: 40471,
        name: 'dpi_20240118161008',
        numPlots: 26,
        privacyLevel: 'users',
        percentComplete: 73.07692,
        learningMaterial: null
    },
    {
        id: 40472,
        name: 'dpi_20240118163226',
        numPlots: 40,
        privacyLevel: 'users',
        percentComplete: 0.0,
        learningMaterial: null
    },
]

const dummyProjectData = [
    {
        plotid: 1,
        sampleid: 1,
        sample_internal_id: 641024844,
        lon: -75.44367425698569,
        lat: -11.821574500503532,
        email: 'jonn.vega@gmail.com',
        flagged: false,
        collection_time: '2024-10-21 17:01',
        analysis_duration: '111.9 secs',
        imagery_title: 'Planet NICFI Public',
        imagery_attributions: '',
        sample_geom: 'POINT(-75.44367425698569 -11.821574500503532)',
        class: 'non_forest',
    },
]

export default {
    
    login$: ({email, password}) => {
        const user = dummyUsers.find(u => u.email === email && u.password === password)
    
        if (user) {
            return of({
                token: user.token,
                email: user.email,
                role: user.role,
            }).pipe(delay(500))
        } else {
            // Return an observable error
            return throwError(() => ({
                status: 401,
                message: 'Invalid credentials',
            })).pipe(delay(500))
        }
    },

    // eslint-disable-next-line no-unused-vars
    getAllInstitutions$: ({token}) =>
        of(dummyInstitutions).pipe(delay(500)),
    
    // eslint-disable-next-line no-unused-vars
    getInstitutionProjects$: ({token, institutionId}) =>
        of(dummyProjects).pipe(delay(500)),
    
    // eslint-disable-next-line no-unused-vars
    getProjectData$: ({projectId}) =>
        of(dummyProjectData).pipe(delay(500))
    
    // login$: ({email, password}) =>
    //     post$('/api/ceo-gateway/login', {
    //         email,
    //         password,
    //         validStatuses: [200, 401],
    //     }),

    // getProjects$: ({institutionId}) =>
    //     get$('/api/ceo-gateway/get-institution-projects', {
    //         body: {institutionId}
    //     }),

    // getUserInstitutions$: () =>
    //     get$('/api/ceo-gateway/get-user-institutions'),

    // getProjectData$: ({projectId}) =>
    //     get$('/api/ceo-gateway/get-project-data', {
    //         body: {projectId}
    //     }),
}
