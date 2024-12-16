const express = require('express')
const session = require('express-session')
const request = require('request')
const urljoin = require('url-join')
const randomColor = require('randomcolor')
const swaggerUi = require('swagger-ui-express')
const bodyParser = require('body-parser')

const config = require('./config')
const swaggerDocument = require('./swagger.json')

const app = express()

app.use(bodyParser.json({limit: '50mb'}))
app.use(bodyParser.urlencoded({limit: '50mb', extended: true, parameterLimit: 50000}))

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

app.use(session({
    secret: '343ji43j4n3jn4jk3n',
    resave: false,
    saveUninitialized: true
}))

app.use(express.json())

app.use([
    '/login',
    '/create-project',
    '/get-collected-data',
    '/delete-project',
    '/get-project-stats',
], (req, res, next) => {
    const {ceo: {url, username, password}} = config

    request.post({
        url: urljoin(url, 'login'),
        form: {
            email: username,
            password,
        },
    }).on('response', response => {
        const cookie = response.headers['set-cookie']
        req.session.cookie = cookie
        request.get({
            headers: {
                Cookie: cookie,
            },
            url: urljoin(url, 'account'),
            followRedirect: false,
        }).on('response', response => {
            const {statusCode} = response
            req.loginStatusCode = statusCode !== 302 ? 200 : 403
            req.isLogged = statusCode !== 302 ? true : false
            next()
        }).on('error', err => {
            next(err)
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/login', (req, res, next) => {
    res.sendStatus(req.loginStatusCode)
})

app.post('/create-project', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}} = req
    const {ceo: {url, institutionId}} = config
    const {classes, plotSize, plots, title, imageryId} = req.body
    if (!Array.isArray(classes) || classes.length === 0
        || typeof plotSize !== 'number' || plotSize < 0
        || !Array.isArray(plots) || plots.length === 0
        || typeof title !== 'string' || title.trim() === ''
        || (imageryId !== undefined && typeof imageryId !== 'number')) {
        return res.status(400).send('Bad Request')
    }
    let csvHeader = Object.keys(plots.reduce((result, obj) => {
        return Object.assign(result, obj)
    }, {})).sort()
    csvHeader.splice(csvHeader.indexOf('lon'), 1)
    csvHeader.splice(csvHeader.indexOf('lat'), 1)
    const plotFile = plots.reduce((acc, curr, i) => {
        const {lon, lat, ...newCurr} = curr
        let csvRecord = `${acc}\n${lon},${lat},${i+1}`
        if (csvHeader.length !== 0) {
            csvHeader.forEach(key => {
                const value = newCurr[key] || ''
                csvRecord = `${csvRecord},${value}`
            })
        }
        return csvRecord
    }, csvHeader.length !== 0 ? `LON,LAT,PLOTID,${csvHeader.join()}` : 'LON,LAT,PLOTID')
    const colors = randomColor({
        count: classes.length,
        hue: 'random',
    })
    const sampleValues = {
        0: {
            question: 'CLASS',
            answers: classes.reduce((accumulator, currentValue, index) => {
                accumulator[index] = {
                    answer: currentValue,
                    color: colors[index],
                    hide: false
                }
                return accumulator
            }, {}),
            parentQuestionId: -1,
            parentAnswerIds: [],
            dataType: 'text',
            componentType: 'button',
            cardOrder: 1
        }
    }
    const data = {
        institutionId,
        imageryId: 5,
        description: title,
        institutionId,
        name: title,
        numPlots: '',
        plotDistribution: 'csv',
        plotShape: 'square',
        plotSize: plotSize,
        plotSpacing: '',
        privacyLevel: 'private',
        projectTemplate: '0',
        projectOptions: {
            showGEEScript: false,
            showPlotInformation: false,
            collectConfidence: false,
            autoLaunchGeoDash: true
        }, //Can change based on preferences
        designSettings: {
            userAssignment: {
                userMethod: 'none',
                users: [],
                percents: []
            },
            qaqcAssignment: {
                qaqcMethod: 'none',
                percent: 0,
                smes: [],
                timesToReview: 2
            },
            sampleGeometries: {
                points: true,
                lines: true,
                polygons: true
            }
        },
        sampleDistribution: 'center',
        samplesPerPlot: '',
        sampleResolution: plotSize,
        surveyQuestions: sampleValues,
        surveyRules: [],
        useTemplatePlots: false,
        useTemplateWidgets: false,
        plotFileName: 'plots.csv',
        plotFileBase64: ',' + Buffer.from(plotFile).toString('base64'),
        sampleFileName: '',
        sampleFileBase64: '',
    }
    request.post({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'create-project'),
        json: data,
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const jsonObject = JSON.parse(data)
            const {projectId, tokenKey, errorMessage} = jsonObject
            const isInteger = n => /^\d+$/.test(n)
            if (!isInteger(projectId)) {
                res.status(400).send({
                    projectId: 0,
                    ceoCollectionUrl: '',
                    errorMessage,
                })
            } else {
                request.post({
                    headers: {
                        Cookie: cookie,
                    },
                    url: urljoin(url, 'publish-project'),
                    qs: {
                        projectId,
                    },
                }).on('response', response => {
                    const ceoCollectionUrl = urljoin(url, 'collection', `?projectId=${projectId}&tokenKey=${tokenKey}`)
                    res.send({
                        projectId,
                        ceoCollectionUrl,
                        errorMessage: '',
                    })
                }).on('error', err => {
                    next(err)
                })
            }
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/get-collected-data/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}, params: {id}} = req
    const {ceo: {url}} = config
    request.get({
        headers: {
            Cookie: cookie['0'],
        },
        url: urljoin(url, 'get-project-by-id'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const project = JSON.parse(data.toString())
            const {question, answers} = project.surveyQuestions[0] // surveyQuestions is now an object
            if (!question || !answers) return res.sendStatus(500)
            const answersById = Object.values(answers).reduce((acc, cur) => {
                acc[cur.answer] = cur.id
                return acc
            }, {})
            request.get({
                headers: {
                    Cookie: cookie['0'],
                },
                url: urljoin(url, 'dump-project-raw-data'),
                qs: {
                    projectId: id,
                },
            }).on('response', response => {
                let body = ''
                response.on('data', data => {
                    body += data
                }).on('end', () => {
                    const lines = body.toString().split('\n')
                    const header = lines[0].split(',')
                    const qIndex = header.findIndex(ele => ele === question.toUpperCase())
                    const ret = lines.slice(1).reduce((acc, cur) => {
                        const values = cur.split(',')
                        const [id, , yCoord, xCoord] = values
                        const answer = values[qIndex] || ''
                        const answerId = answersById[answer] || ''
                        return `${acc}\n${id},${yCoord},${xCoord},${answerId},${answer}`
                    }, 'id,YCoordinate,XCoordinate,class,editedClass')
                    res.send(ret)
                })
            }).on('error', err => {
                next(err)
            })
        })
    }).on('error', err => {
        next(err)
    })
})

app.get('/delete-project/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}, params: {id}} = req
    const {ceo: {url}} = config
    request.post({
        headers: {
            Cookie: cookie,
        },
        url: urljoin(url, 'archive-project'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        res.sendStatus(statusCode)
    }).on('error', err => {
        next(err)
    })
})

app.get('/get-project-stats/:id', (req, res, next) => {
    const {isLogged} = req
    if (!isLogged) res.status(500).send({error: 'Login failed!'})
    const {session: {cookie}, params: {id}} = req
    const {ceo: {url}} = config
    request.get({
        headers: {
            Cookie: cookie,
        },
        url: urljoin(url, 'get-project-stats'),
        qs: {
            projectId: id,
        },
    }).on('response', response => {
        const {statusCode} = response
        if (statusCode !== 200) return res.sendStatus(statusCode)
        response.on('data', data => {
            const stats = JSON.parse(data.toString())
            const {unanalyzedPlots, analyzedPlots, flaggedPlots} = stats
            const totalPlotsReviewed = flaggedPlots + analyzedPlots
            const completationPercentage = parseInt((totalPlotsReviewed / (flaggedPlots + analyzedPlots + unanalyzedPlots)) * 100)
            res.send({
                projectId: id,
                unanalyzedPlots,
                analyzedPlots,
                flaggedPlots,
                totalPlotsReviewed,
                completationPercentage,
            })
        })
    }).on('error', err => {
        next(err)
    })
})

app.post('/get-all-institutions', (req, res, next) => {
    
    const {token} = req.body
    const cookie = `ring-session=${token}`

    if (!token) {
        return res.status(400).send({error: 'Token is required!'})
    }

    const {ceo: {url}} = config

    request.get({
        url: urljoin(url, 'get-all-institutions'),
        headers: {Cookie: cookie},
    }).on('response', response => {
        let body = ''

        response.on('data', chunk => {
            body += chunk
        }).on('end', () => {
            try {
                const institutions = JSON.parse(body)
                res.send(institutions)
            } catch (err) {
                next(err)
            }
        })
    }).on('error', err => {
        next(err)
    })
})

app.post('/get-institution-projects', (req, res, next) => {
    const {token, institutionId} = req.body
    const cookie = `ring-session=${token}`
    
    if (!token) {
        return res.status(400).send({statusCode: 400, error: 'Token is required!'})
    }

    if (!institutionId || isNaN(institutionId)) {
        return res.status(400).send({statusCode: 400, error: 'Invalid or missing institutionId!'})
    }

    const {ceo: {url}} = config

    request.get({
        url: urljoin(url, 'get-institution-projects'),
        qs: {institutionId},
        headers: {Cookie: cookie},
    }, (error, response, body) => {
        if (error) {
            return next(error)
        }
        try {
            const projects = JSON.parse(body)
            res.send(projects)
        } catch (err) {
            next(err)
        }
    })
})

app.post('/dump-project-data', (req, res, next) => {
    const {token, projectId, csvType} = req.body
    const cookie = `ring-session=${token}`

    const url = urljoin(config.ceo.url, csvType === 'plot'? 'dump-project-raw-data': 'dump-project-aggregate-data')

    if (!token) {
        return res.status(400).send({statusCode: 500, error: 'Token is required!'})
    }

    if (!projectId || isNaN(projectId)) {
        return res.status(400).send({statusCode: 400, error: 'Invalid or missing projectId!'})
    }

    request.get({
        url: url,
        qs: {projectId},
        headers: {Cookie: cookie},
        encoding: null,
    }).on('response', response => {
        res.set({
            'Content-Type': response.headers['content-type'],
            'Content-Disposition': response.headers['content-disposition'],
        })

        response.pipe(res)
    }).on('error', err => {
        next(err)
    })
})

app.post('/login-token', (req, res, next) => {
    const {email, password} = req.body

    if (!email || !password) {
        return res.status(400).send({
            statusCode: 400,
            error: 'email and password are required!'
        })
    }

    const {ceo: {url}} = config

    request.post({
        url: urljoin(url, 'login'),
        form: {
            email: email,
            password,
        },
    }).on('response', response => {
        if (response.statusCode !== 200) {
            return res.status(response.statusCode).send({
                statusCode: response.statusCode,
                error: 'Login failed!'})
        }

        // Check if the response contains the session cookie (CEO always returns 200 even if login fails)
        if (!response.headers['set-cookie']) {
            return res.status(401).send({
                statusCode: 401,
                error: 'Username or password is incorrect!'})
        }

        const cookie = response.headers['set-cookie']['0']

        if (!cookie) {
            return res.status(500).send({
                statusCode: 500,
                error: 'Failed to retrieve session cookie!'})
        }

        res.status(200).send({
            statusCode: 200,
            sessionCookie: cookie
        })
    }).on('error', err => {
        next(err)
    })
})

app.use((err, req, res, next) => {
    console.info(err.stack)
    res.status(500).send('Something went wrong!')
})

const PORT = process.env.PORT || 3000

app.listen(PORT, function() {
    console.info(`App listening on port ${PORT}!`)
})

