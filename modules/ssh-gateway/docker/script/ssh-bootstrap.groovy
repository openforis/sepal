#!/usr/bin/env groovy
@Grab(group = 'org.codehaus.groovy.modules.http-builder', module = 'http-builder', version = '0.7.1')
import groovyx.net.http.RESTClient
@Grab(group = 'org.codehaus.groovy.modules.http-builder', module = 'http-builder', version = '0.7.1')
import groovyx.net.http.RESTClient

def user = this.args[0]
def silent = this.args.length == 2 ? Boolean.valueOf(this.args[1]) : false

new SshBootstrap(user,silent).routine()


class SshBootstrap {

    def restClient = new RESTClient('http://sepal:1025/data/')
    def user
    Boolean silent

    SshBootstrap(user,silent) {
        this.user = user
        this.silent = silent
    }

    def routine() {
        def userSession = this.userSessionStatus
        def activeSessions = userSession?.data?.activeSessions
        if (activeSessions) {
            if (!silent){
                this.listSessions(activeSessions)
            }
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
        restClient.get(
                    path: "sandbox/$user/session/$sessionId"
        )

    }

    def listSessions(def sessions) {
        if (sessions) {
            printMsg('### Active Session(s) ###\n')
            sessions.eachWithIndex { session, idx ->
                def idxReal = idx + 1
                printMsg("  $idxReal. $session.instance.instanceType.name: [ $session.status ]")
            }
            printMsg("  N. Start a new Session\n#########################\n")

        }
    }

    def listInstancesType(def instancesType) {
        if (instancesType) {
            printMsg('### Available Instances type ###\n')
              instancesType.eachWithIndex { iType, idx ->
                def idxReal = idx + 1
                  printMsg("  $idxReal. $iType.name")
            }
            printMsg('\n################################\n')
        }
    }

    def exit(def message, def errorCode, def wait = true) {
        if (!silent){
            printMsg(message)
            if (wait) {
                System.console().readLine(' > Press Enter to exit')
            }
        }
        System.exit(errorCode)
    }

    def printMsg(message){
        if (!silent){
            println(message)
        }
    }

    def promptSessionSelector(def userSession, def activeSessions) {
        def answer = '1'
        try {
            if (!silent){
                answer = System.console().readLine(' > Select an option(1): ')
                if ('N'.equalsIgnoreCase(answer)) {
                    promptSessionCreator(userSession)
                } else {
                    answer = answer?: '1'
                }
            }
            def sessionIndex = Integer.parseInt(answer?.trim()) - 1
            def session = activeSessions[sessionIndex]
            printMsg("$session.instance.instanceType.name: [ $session.status ]")
            def sessionStatus = this.isSessionAlive(session.sessionId).status
            switch (sessionStatus) {
                case 200:
                    if (session?.status?.toString()?.toLowerCase() == 'alive'){
                        this.exit("Session $session.sessionId correctly validated", session.sessionId, false)
                    }else if (session?.status?.toString()?.toLowerCase() == 'requested'){
                        waitUntilAvailable(session.sessionId)
                    }else{
                        this.exit("Session $session.sessionId not available",0)
                    }
                    break
                case 202:
                    waitUntilAvailable(session.sessionId)
                    break
                default:
                    this.exit("Session $session.sessionId not found. $sessionStatus", 0)
            }
        } catch (Exception ex) {
            this.exit("Invalid option selected: $answer", 0)
        }
    }


    def waitUntilAvailable(sessionId){
        Thread.sleep(3000)
        printMsg('Session not available(yet)')
        def sessionRawInfo = this.isSessionAlive(sessionId)
        def sessionStatus = sessionRawInfo.status
        def sessionInfo = sessionRawInfo.data
        switch (sessionStatus) {
            case 200:
                if (sessionInfo?.status?.toString()?.toLowerCase() == 'alive'){
                    this.exit("Session $sessionId available", sessionId, false)
                }else if (sessionInfo?.status?.toString()?.toLowerCase() == 'requested'){
                    waitUntilAvailable(sessionId)
                }else{
                    this.exit("Session $sessionId not available",0)
                }
                break
            case 202:
                waitUntilAvailable(sessionId)
                break
            default:
                this.exit("Session $sessionId not found. $sessionStatus", 0)
        }
        this.exit("Session $sessionId correctly validated", sessionId, false)
    }

    def promptSessionCreator(def userSession) {
        def availableInstances = userSession?.data?.availableInstanceTypes
        if (availableInstances) {
            if (availableInstances.size > 1 && !silent) {
                promptInstanceTypeSelection(availableInstances)
            } else {
                printMsg('Going to generate a new session')
                def availableInstance = availableInstances[0]
                this.requestSession(availableInstance.requestUrl).data
                printMsg('Session Created')
                this.routine()
            }
        } else {
            this.exit('No instance(s) type available', 0)
        }
    }

    def promptInstanceTypeSelection(def availableInstances) {
        def answer = '1'
        try {
            if (!silent){
                this.listInstancesType(availableInstances)
                answer = System.console().readLine(' > Select an instance type(1): ')
                answer = answer?: '1'
            }
            def typeIndex = Integer.parseInt(answer.trim()) - 1
            def selectedInstanceType = availableInstances[typeIndex]
            this.requestSession(selectedInstanceType.requestUrl).data
            routine()
        } catch (Exception ex) {
            this.exit("Invalid type selected $ex", 0)
        }
    }


}


