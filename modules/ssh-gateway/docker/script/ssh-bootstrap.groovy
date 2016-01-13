#!/usr/bin/env groovy
@Grab(group = 'org.codehaus.groovy.modules.http-builder', module = 'http-builder', version = '0.7.1')
import groovyx.net.http.RESTClient
@Grab(group = 'org.codehaus.groovy.modules.http-builder', module = 'http-builder', version = '0.7.1')
import groovyx.net.http.RESTClient
@Grab(group = 'org.codehaus.groovy.modules.http-builder', module = 'http-builder', version = '0.7.1')
import groovyx.net.http.RESTClient

def user = this.args[0]

def bootstrap = new SshBootstrap(user).routine()


class SshBootstrap {

    def restClient = new RESTClient('http://sepal:1025/data/')
    def user

    SshBootstrap(def user) {
        this.user = user
    }

    def routine() {
        def userSession = this.userSessionStatus
        def activeSessions = userSession?.data?.activeSessions
        this.listSessions(activeSessions)
        if (activeSessions) {
            this.promptSessionSelector(userSession, activeSessions)
        } else {
            this.promptSessionCreator(userSession)
        }
    }

    def getUserSessionStatus() {
        restClient.get(
                path: "sandbox/$user"
        )
    }

    def requestSession(def requestUrl) {
        restClient.post(
                path: requestUrl
        )
    }

    def isSessionAlive(def sessionId) {
        def status = 0
        try {
            def response = restClient.get(
                    path: "sandbox/$user/session/$sessionId"
            )
            status = response.status
        } catch (Exception ex) {
            status = 500
        }
        return status
    }

    def listSessions(def sessions) {
        if (sessions) {
            println '### Active Session(s) ###'
            println ''
            sessions.eachWithIndex { session, idx ->
                def idxReal = idx + 1
                println "  $idxReal. $session.instance.instanceType.name: [ $session.status ]"
            }
            println ''
            println '#########################'
            println ''
        }
    }

    def listInstancesType(def instancesType) {
        if (instancesType) {
            println '### Available Instances type ###'
            println ''
            instancesType.eachWithIndex { iType, idx ->
                def idxReal = idx + 1
                println "  $idxReal. $iType.name"
            }
            println ''
            println '################################'
            println ''
        }
    }

    def exit(def message, def errorCode, def wait = true) {
        println message
        if (wait) {
            System.console().readLine(' > Press Enter to exit')
        }

        System.exit(errorCode)
    }

    def promptSessionSelector(def userSession, def activeSessions) {
        def answer = System.console().readLine(' > Enter the session number to join it or Press N to start a brand new one: ')
        try {
            if ('N'.equalsIgnoreCase(answer)) {
                promptSessionCreator(userSession)
            } else {
                def sessionIndex = Integer.parseInt(answer?.trim()) - 1
                def session = activeSessions[sessionIndex]
                println "$session.instance.instanceType.name: [ $session.status ]"
                def sessionStatus = this.isSessionAlive(session.sessionId)
                switch (sessionStatus) {
                    case 200:
                        this.exit("Session $session.sessionId correctly validated", session.sessionId, false)
                        break
                    case 202:
                        this.exit("Session $session.sessionId not available yet. Please try again later", 0)
                        break
                    default:
                        this.exit("Session $session.sessionId not found.", 0)
                }
            }
        } catch (Exception ex) {
            this.exit("Invalid option selected: $answer", 0)
        }
    }

    def promptSessionCreator(def userSession) {
        def availableInstances = userSession?.data?.availableInstanceTypes
        if (availableInstances) {
            if (availableInstances.size > 1) {
                promptInstanceTypeSelection(availableInstances)
            } else {
                println 'Going to generate a new session'
                def availableInstance = availableInstances[0]
                def requestedSession = this.requestSession(availableInstance.requestUrl).data
                println 'Session Created'
                this.routine()
            }
        } else {
            this.exit('No instance(s) type available', 0)
        }
    }

    def promptInstanceTypeSelection(def availableInstances) {
        this.listInstancesType(availableInstances)
        try {
            def answer = System.console().readLine(' > Select an instance type: ')
            def typeIndex = Integer.parseInt(answer.trim()) - 1
            def selectedInstanceType = availableInstances[typeIndex]
            this.requestSession(selectedInstanceType.requestUrl).data
            println 'Session Created'
            this.routine()
        } catch (Exception ex) {
            this.exit("Invalid type selected ", 0)
        }
    }


}


