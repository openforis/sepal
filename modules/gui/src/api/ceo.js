// import {of, tap, throwError} from 'rxjs'
// import {delay, finalize} from 'rxjs/operators'

import {get$, post$, postJson$} from '~/http-client'

// const dummyUsers = [
//     {email: 'd', password: 'd', token: 'tokenUser1', role: 'admin'},
//     {email: 'f', password: 'f', token: 'tokenUser2', role: 'user'},
// ]

// const dummyInstitutions = [
//     {
//         id: 3,
//         name: 'NASA',
//         isMember: true
//     },
//     {
//         id: 4,
//         name: 'US Forest Service',
//         isMember: true
//     },
//     {
//         id: 9,
//         name: 'SERVIR SCO',
//         isMember: true
//     },
//     {
//         id: 10,
//         name: 'SERVIR SCO',
//         isMember: true
//     },
//     {
//         id: 1,
//         name: 'African Forest Observatory',
//         isMember: true
//     },
//     {
//         id: 99,
//         name: 'FAO --',
//         isMember: true
//     },
// ]

// /**
//  * Dictionary of institutionId to a set of dummy projects.
//  * You can customize these as needed.
//  */
// const dummyProjectsByInstitution = {
//     1: [
//         {
//             id: 101,
//             name: 'asdfasdfasdf234234234',
//             numPlots: 20,
//             privacyLevel: 'users',
//             percentComplete: 50.0,
//             learningMaterial: 'http://example.com/africa-forest'
//         },
//         {
//             id: 102,
//             name: 'lalalalalalal303003030',
//             numPlots: 10,
//             privacyLevel: 'users',
//             percentComplete: 20.0,
//             learningMaterial: null
//         }
//     ],
//     4: [
//         {
//             id: 201,
//             name: 'poepepepepep098098',
//             numPlots: 40,
//             privacyLevel: 'users',
//             percentComplete: 75.0,
//             learningMaterial: null
//         },
//         {
//             id: 202,
//             name: 'jkdldldkja089',
//             numPlots: 30,
//             privacyLevel: 'users',
//             percentComplete: 10.0,
//             learningMaterial: 'http://example.com/usfs-wildfire'
//         }
//     ],
//     99: [
        
//     ]

// }

// // Default projects if institutionId not found in dummyProjectsByInstitution
// const defaultDummyProjects = [
//     {
//         id: 40471,
//         name: 'dpi_20240118161008',
//         numPlots: 26,
//         privacyLevel: 'users',
//         percentComplete: 73.07692,
//         learningMaterial: null
//     },
//     {
//         id: 40472,
//         name: 'dpi_20240118163226',
//         numPlots: 40,
//         privacyLevel: 'users',
//         percentComplete: 0.0,
//         learningMaterial: null
//     }
// ]

// const dummyProjectData = [
//     {
//         plotid: 1,
//         sampleid: 1,
//         sample_internal_id: 641024844,
//         lon: -75.44367425698569,
//         lat: -11.821574500503532,
//         email: 'jonn.vega@gmail.com',
//         flagged: false,
//         collection_time: '2024-10-21 17:01',
//         analysis_duration: '111.9 secs',
//         imagery_title: 'Planet NICFI Public',
//         imagery_attributions: '',
//         sample_geom: 'POINT(-75.44367425698569 -11.821574500503532)',
//         class: 'non_forest',
//     },
// ]

// // Helper function to convert an array of objects to CSV
// function arrayToCsv(arr) {
//     if (!Array.isArray(arr) || arr.length === 0) {
//         return ''
//     }
//     const headers = Object.keys(arr[0])
//     const lines = arr.map(obj =>
//         headers.map(h => {
//             const value = obj[h] != null ? String(obj[h]) : ''
//             // Enclose values with commas or quotes in double quotes and escape internal quotes
//             return value.includes(',') || value.includes('"') || value.includes('\n')
//                 ? `"${value.replace(/"/g, '""')}"`
//                 : value
//         }).join(',')
//     )
//     return [headers.join(','), ...lines].join('\n')
// }

export default {

    login$: ({email, password}) =>
        post$('/api/ceo-gateway/login-token', {
            body: {email, password},
            maxRetries: 0,
        }),
     
    getAllInstitutions$: ({token}) =>
        post$('/api/ceo-gateway/get-all-institutions', {
            body: {token},
        }),
        
    getInstitutionProjects$: ({token, institutionId}) => {
        post$('/api/ceo-gateway/get-institution-projects', {
            body: {token, institutionId},
        })
        
    },
    
    getProjectData$: ({token, projectId, csvType}) => {
        post$('/api/ceo-gateway/get-project-data', {
            body: {token, projectId, csvType},
        })
    }
}
