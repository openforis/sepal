import {delete$, get$, post$} from 'http-client'
import {map} from 'rxjs/operators'
import _ from 'lodash'

export default {
    loadCurrentUser$: () =>
        get$('/api/user/current', {
            validStatuses: [200, 401]
        }).pipe(toResponse),

    loadUserMessages$: () =>
        get$('/api/notification/notifications').pipe(toResponse),

    updateMessage$: message =>
        post$(`/api/notification/messages/${message.id}`, {
            body: message
        }).pipe(toResponse),

    removeMessage$: message =>
        delete$(`/api/notification/messages/${message.id}`).pipe(toResponse),

    updateMessageState$: userMessage =>
        post$(`/api/notification/notifications/${userMessage.message.id}`, {
            body: {
                state: userMessage.state
            }
        }).pipe(toResponse),

    loadCurrentUserReport$: () =>
        get$('/api/sessions/report')
            .pipe(toResponse),

    login$: (username, password) =>
        post$('/api/user/login', {
            username, password,
            validStatuses: [200, 401]
        }).pipe(toResponse),

    logout$: () =>
        post$('/api/user/logout').pipe(toResponse),

    requestPasswordReset$: email =>
        post$('/api/user/password/reset-request', {
            body: {email}
        }),

    validateToken$: token =>
        post$('/api/user/validate-token', {
            body: {token}
        }),

    resetPassword$: (token, username, password) =>
        post$('/api/user/password/reset', {
            body: {token, password}
        }),

    updateCurrentUserDetails$: ({name, email, organization}) =>
        post$('/api/user/current/details', {
            body: {name, email, organization}
        }).pipe(toResponse),

    changePassword$: ({oldPassword, newPassword}) =>
        post$('/api/user/current/password', {
            body: {oldPassword, newPassword}
        }).pipe(toResponse),

    getGoogleAccessRequestUrl$: destinationUrl =>
        get$('/api/user/google/access-request-url', {query: {destinationUrl}})
            .pipe(toResponse),

    revokeGoogleAccess$: () =>
        post$('/api/user/google/revoke-access')
            .pipe(toResponse),

    updateUserSession$: session =>
        post$(`/api/sessions/session/${session.id}/earliestTimeoutTime`, {
            body: {
                hours: session.keepAlive
            }
        }).pipe(toResponse),

    stopUserSession$: session =>
        delete$(`/api/sessions/session/${session.id}`),

    getUserList$: () =>
        get$('/api/user/list')
            .pipe(toResponse),

    getBudgetReport$: () =>
        get$('/api/budget/report')
            .pipe(toResponse),

    updateUserDetails$: userDetails =>
        post$('/api/user/details', {
            body: userDetails
        }).pipe(toResponse),

    updateUserBudget$: budget =>
        post$('/api/budget', {
            body: budget
        }).pipe(toResponse)
}

const toResponse = map(e => e.response)

/* eslint-disable */
const _sampleUserMessages = [{
    "message": {
        "creationTime": "2018-10-03T18:55:39+0000",
        "updateTime": "2018-10-03T18:55:39+0000",
        "type": "SYSTEM",
        "id": "4150738e-b005-5fff-6399-a2db8db20699",
        "contents": "<p>Dear SEPAL users</p><p>Do you have a cool project you've done in SEPAL? Have you produced interesting results? Are you using SEPAL for something unique?</p><p>&nbsp;</p><p>We want to know about it! Please send anything you are willing to share: a little note, a screenshot, a script, a report...anything you have...to: erik.lindquist@fao.org</p><p>&nbsp;</p><p>We would like to use your examples in our annual report and, perhaps, we can feature your work in a FAO publication or a SEPAL newsletter.</p><p>Thank you!</p><p>&nbsp;</p><p>Estimados usuarios de SEPAL</p><p>Tienes un proyecto genial que hayas hecho en SEPAL? Has producido resultados interesantes? Est\u00e1s usando SEPAL para algo \u00fanico?</p><p>Queremos saber al respecto! Env\u00ede cualquier cosa que desee compartir: una peque\u00f1a nota, una captura de pantalla, un script, un informe ... cualquier cosa que tenga ... para: &nbsp;erik.lindquist@fao.org</p><p>&nbsp;</p><p>Nos gustar\u00eda usar sus ejemplos en nuestro informe anual y, tal vez, podemos presentar su trabajo en una publicaci\u00f3n de la FAO o en un bolet\u00edn de noticias de SEPAL.</p><p>Gracias!</p><p>&nbsp;</p><p>&nbsp;</p><p>Chers utilisateurs de SEPAL</p><p>Avez-vous un projet int\u00e9ressant que vous avez r\u00e9alis\u00e9 \u00e0 SEPAL? Avez-vous produit des r\u00e9sultats int\u00e9ressants? Utilisez-vous SEPAL pour quelque chose d'unique?</p><p>&nbsp;</p><p>Nous voulons savoir \u00e0 ce sujet! Envoyez tout ce que vous souhaitez partager: une petite note, une capture d'\u00e9cran, un script, un rapport ... tout ce que vous avez ... \u00e0: &nbsp;erik.lindquist@fao.org</p><p>&nbsp;</p><p>Nous aimerions utiliser vos exemples dans notre rapport annuel et peut-\u00eatre pourrions-nous pr\u00e9senter votre travail dans une publication de la FAO ou dans un bulletin d'information de SEPAL.</p><p>Je vous remercie!</p>",
        "username": "lindquist",
        "subject": "Share your work, products, experiences, cool images with us!"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-08-24T15:35:30+0000",
        "updateTime": "2018-08-24T15:35:30+0000",
        "type": "SYSTEM",
        "id": "d2c829b2-89fd-58cb-5d23-9463ec6f1ce7",
        "contents": "<p>Dear SEPAL users</p><p>All processing modules/apps are working now. Apologies for any disruption.</p><p>&nbsp;</p>",
        "username": "lindquist",
        "subject": "SEPAL processing modules are working now"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-08-24T03:20:41+0000",
        "updateTime": "2018-08-24T03:20:41+0000",
        "type": "SYSTEM",
        "id": "a004f0c8-601f-3e78-afab-4010643986fc",
        "contents": "<p>Dear SEPAL users</p><p>The SEPAL modules/apps are currently not working. We will have a fix for this quickly.</p><p>&nbsp;</p>",
        "username": "lindquist",
        "subject": "SEPAL processing modules/apps are not working"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-08-09T15:39:54+0000",
        "updateTime": "2018-08-09T15:39:54+0000",
        "type": "SYSTEM",
        "id": "e984d3c6-689a-c9bb-c00f-c11917b7dfeb",
        "contents": "<p>Dear SEPAL users</p><p>The BFAST Explorer app is working.</p>",
        "username": "lindquist",
        "subject": "BFAST Explorer is Working :)"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-08-09T15:38:54+0000",
        "updateTime": "2018-08-09T15:38:54+0000",
        "type": "SYSTEM",
        "id": "59b2c876-b4a1-7a5d-68f8-0c56b0671698",
        "contents": "<p>Dear SEPAL users</p><p>Sentinel-2 thumbnail images are currently unavailable due to a change in policy affecting the way we access the data via AWS. We have fixed the problem and this issue will be solved in the next release of SEPAL. The actual creation of the Sentinel mosaics is not affected.</p>",
        "username": "lindquist",
        "subject": "Sentinel-2 Thumbnails Disabled"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-07-30T17:18:03+0000",
        "updateTime": "2018-07-30T17:18:03+0000",
        "type": "SYSTEM",
        "id": "b2eb5f2e-35ea-37bd-a522-d512f808735b",
        "contents": "<p>Dear SEPAL users</p><p>The BFAST Explorer app is currently not working. We know the problem and are working to fix it. We will update you when it is working.</p>",
        "username": "lindquist",
        "subject": "BFAST Explorer App not working"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-07-21T13:06:26+0000",
        "updateTime": "2018-07-21T13:06:26+0000",
        "type": "SYSTEM",
        "id": "be9142ca-4c04-381e-f3ef-4816fef2ec89",
        "contents": "<p>Dear SEPAL users</p><p>SEPAL functionality has been restored.</p><p>La funcionalidad SEPAL ha sido restaurada.</p><p>La fonctionnalit\u00e9 SEPAL a \u00e9t\u00e9 restaur\u00e9e.</p>",
        "username": "lindquist",
        "subject": "SEPAL Functionality Normal / Funcionalidad Normal / Fonctionnalit\u00e9 Normal"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-07-20T14:21:22+0000",
        "updateTime": "2018-07-20T14:21:22+0000",
        "type": "SYSTEM",
        "id": "28b711e5-53f4-c570-51ca-94bfcb9fc14e",
        "contents": "<p>Dear SEPAL users</p><p>We are currently experiencing an issue with Google authentication that has temporarily affected downloading data, time-series generation, classification and change detection. We have identified the problem and expect a solution soon. You can continue to create mosaics/composites, save recipes, and use the processing modules. We are very sorry for this inconvenience.</p><p>&nbsp;</p><p>Actualmente estamos experimentando un problema con la autenticaci\u00f3n de Google que ha afectado temporalmente la descarga de datos, la generaci\u00f3n de series temporales, la clasificaci\u00f3n y la detecci\u00f3n de cambios. Hemos identificado el problema y esperamos una soluci\u00f3n pronto. Puede continuar creando mosaicos / compuestos, guardar recetas y usar los m\u00f3dulos de procesamiento. Lo sentimos mucho por este inconveniente.</p><p>&nbsp;</p><p>Nous rencontrons actuellement un probl\u00e8me avec l'authentification Google qui a temporairement affect\u00e9 le t\u00e9l\u00e9chargement des donn\u00e9es, la g\u00e9n\u00e9ration de s\u00e9ries chronologiques, la classification et la d\u00e9tection des modifications. Nous avons identifi\u00e9 le probl\u00e8me et attendons une solution bient\u00f4t. Vous pouvez continuer \u00e0 cr\u00e9er des mosa\u00efques / composites, enregistrer des recettes et utiliser les modules de traitement. Nous sommes vraiment d\u00e9sol\u00e9s pour ce d\u00e9sagr\u00e9ment.</p>",
        "username": "lindquist",
        "subject": "SEPAL Functionality Reduced / Funcionalidad Reducida / Fonctionnalit\u00e9 R\u00e9duite"
    },
    "username": "paolini",
    "state": "READ"
}, {
    "message": {
        "creationTime": "2018-07-11T06:35:22+0000",
        "updateTime": "2018-07-11T06:35:42+0000",
        "type": "SYSTEM",
        "id": "665a0ead-cbfa-1d2d-cfae-1448051a7e10",
        "contents": "<p>Please remember to delete data from your workspace that you do not need for immediate use. If you need assistance please contact erik.lindquist@fao.org.</p><p>&nbsp;</p><p>Recuerde borrar datos de su \u00e1rea de trabajo que no necesita para su uso inmediato. Si necesita ayuda, puede contactar erik.lindquist@fao.org.</p><p>&nbsp;</p><p>N'oubliez pas de supprimer les donn\u00e9es de votre espace de travail dont vous n'avez pas besoin pour une utilisation imm\u00e9diate. Si vous avez besoin d'aide, veuillez contacter erik.lindquist@fao.org.</p>",
        "username": "lindquist",
        "subject": "Data Storage / Mantenimiento de datos / Garder des donn\u00e9es "
    },
    "username": "paolini",
    "state": "READ"
}]

/* eslint-disable */
const _sampleUserReport = {
    'sessions': [{
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-1',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'T2Small',
            'path': 'sandbox/instance-type/T2Small',
            'name': 't2.small',
            'description': '1 CPU / 2.0 GiB',
            'hourlyCost': 0.025
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-2',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'M3Medium',
            'path': 'sandbox/instance-type/M3Medium',
            'name': 'm3.medium',
            'description': '1 CPU / 3.75 GiB',
            'hourlyCost': 0.073
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-3',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'M44xlarge',
            'path': 'sandbox/instance-type/M44xlarge',
            'name': 'm4.4xlarge',
            'description': '16 CPU / 64.0 GiB',
            'hourlyCost': 0.95
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-4',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'R48xlarge',
            'path': 'sandbox/instance-type/R48xlarge',
            'name': 'r4.8xlarge',
            'description': '32 CPU / 244.0 GiB',
            'hourlyCost': 2.371
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }],
    'instanceTypes': [{
        'id': 'T2Small',
        'path': 'sandbox/instance-type/T2Small',
        'name': 't2.small',
        'description': '1 CPU / 2.0 GiB',
        'hourlyCost': 0.025
    }, {
        'id': 'M3Medium',
        'path': 'sandbox/instance-type/M3Medium',
        'name': 'm3.medium',
        'description': '1 CPU / 3.75 GiB',
        'hourlyCost': 0.073
    }, {
        'id': 'M4Large',
        'path': 'sandbox/instance-type/M4Large',
        'name': 'm4.large',
        'description': '2 CPU / 8.0 GiB',
        'hourlyCost': 0.119
    }, {
        'id': 'M4Xlarge',
        'path': 'sandbox/instance-type/M4Xlarge',
        'name': 'm4.xlarge',
        'description': '4 CPU / 16.0 GiB',
        'hourlyCost': 0.238
    }, {
        'id': 'M42xlarge',
        'path': 'sandbox/instance-type/M42xlarge',
        'name': 'm4.2xlarge',
        'description': '8 CPU / 32.0 GiB',
        'hourlyCost': 0.475
    }, {
        'id': 'M44xlarge',
        'path': 'sandbox/instance-type/M44xlarge',
        'name': 'm4.4xlarge',
        'description': '16 CPU / 64.0 GiB',
        'hourlyCost': 0.95
    }, {
        'id': 'M410xlarge',
        'path': 'sandbox/instance-type/M410xlarge',
        'name': 'm4.10xlarge',
        'description': '40 CPU / 160.0 GiB',
        'hourlyCost': 2.377
    }, {
        'id': 'M416xlarge',
        'path': 'sandbox/instance-type/M416xlarge',
        'name': 'm4.16xlarge',
        'description': '64 CPU / 256.0 GiB',
        'hourlyCost': 3.803
    }, {
        'id': 'C4Large',
        'path': 'sandbox/instance-type/C4Large',
        'name': 'c4.large',
        'description': '2 CPU / 3.75 GiB',
        'hourlyCost': 0.113
    }, {
        'id': 'C4Xlarge',
        'path': 'sandbox/instance-type/C4Xlarge',
        'name': 'c4.xlarge',
        'description': '4 CPU / 7.5 GiB',
        'hourlyCost': 0.226
    }, {
        'id': 'C42xlarge',
        'path': 'sandbox/instance-type/C42xlarge',
        'name': 'c4.2xlarge',
        'description': '8 CPU / 15.0 GiB',
        'hourlyCost': 0.453
    }, {
        'id': 'C44xlarge',
        'path': 'sandbox/instance-type/C44xlarge',
        'name': 'c4.4xlarge',
        'description': '16 CPU / 30.0 GiB',
        'hourlyCost': 0.905
    }, {
        'id': 'C48xlarge',
        'path': 'sandbox/instance-type/C48xlarge',
        'name': 'c4.8xlarge',
        'description': '36 CPU / 60.0 GiB',
        'hourlyCost': 1.811
    }, {
        'id': 'R4Large',
        'path': 'sandbox/instance-type/R4Large',
        'name': 'r4.large',
        'description': '2 CPU / 15.25 GiB',
        'hourlyCost': 0.148
    }, {
        'id': 'R4Xlarge',
        'path': 'sandbox/instance-type/R4Xlarge',
        'name': 'r4.xlarge',
        'description': '4 CPU / 30.5 GiB',
        'hourlyCost': 0.296
    }, {
        'id': 'R42xlarge',
        'path': 'sandbox/instance-type/R42xlarge',
        'name': 'r4.2xlarge',
        'description': '8 CPU / 61.0 GiB',
        'hourlyCost': 0.593
    }, {
        'id': 'R44xlarge',
        'path': 'sandbox/instance-type/R44xlarge',
        'name': 'r4.4xlarge',
        'description': '16 CPU / 122.0 GiB',
        'hourlyCost': 1.186
    }, {
        'id': 'R48xlarge',
        'path': 'sandbox/instance-type/R48xlarge',
        'name': 'r4.8xlarge',
        'description': '32 CPU / 244.0 GiB',
        'hourlyCost': 2.371
    }, {
        'id': 'R416xlarge',
        'path': 'sandbox/instance-type/R416xlarge',
        'name': 'r4.16xlarge',
        'description': '64 CPU / 488.0 GiB',
        'hourlyCost': 4.742
    }, {
        'id': 'X116xlarge',
        'path': 'sandbox/instance-type/X116xlarge',
        'name': 'x1.16xlarge',
        'description': '64 CPU / 976.0 GiB',
        'hourlyCost': 8.003
    }, {
        'id': 'X132xlarge',
        'path': 'sandbox/instance-type/X132xlarge',
        'name': 'x1.32xlarge',
        'description': '128 CPU / 1920.0 GiB',
        'hourlyCost': 16.006
    }],
    'spending': {
        'monthlyInstanceBudget': 1.0,
        'monthlyInstanceSpending': 0.025,
        'monthlyStorageBudget': 1.0,
        'monthlyStorageSpending': 2.233275753451851E-5,
        'storageQuota': 20.0,
        'storageUsed': 9.6E-5
    }
}
