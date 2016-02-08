#!/usr/bin/env groovy
@Grab(group = 'org.codehaus.groovy.modules.http-builder', module = 'http-builder', version = '0.7.1')
@Grab(group='com.ocpsoft', module='ocpsoft-pretty-time', version='1.0.7')
import groovyx.net.http.RESTClient

user = this.args[0] as String
silent = Boolean.valueOf(this.args[1])
def sepalEndpoint = this.args[2] as String

restClient = new RESTClient(sepalEndpoint)
routine()

def routine() {
    def sessionInfo = loadUserSessionStatus().data
    def sessions = sessionInfo.sessions
    if (sessions) {
        if (!silent) {
            listSessions(sessions)
        }
        promptSessionSelector(sessionInfo, sessions)
    } else {
        promptSessionCreator(sessionInfo)
    }
}

def loadUserSessionStatus() {
    restClient.get(
            path: "sandbox/$user"
    )
}

def requestSession(def requestUrl) {
    restClient.post(
            path: requestUrl
    )
}

def joinSession(def path) {
    restClient.post(
            path: path
    )
}

void listSessions(List<Map> sessions) {
    printMsg('### Session(s) ###\n')
    sessions.eachWithIndex { session, idx ->
        printMsg("  ${idx + 1}. [ $session.status ] $session.creationTime ($session.instanceType.name)")
    }
    printMsg("  N. Start a new Session\n#########################\n")
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
    if (!silent) {
        printMsg(message)
        if (wait) {
            readLine(' > Press Enter to exit')
        }
    }
    System.exit(errorCode)
}

def printMsg(message) {
    if (!silent) {
        println(message)
    }
}

def promptSessionSelector(def sandboxInfo, List<Map> sessions) {
    def answer = '1'
    try {
        if (!silent) {
            answer = readLine(' > Select an option(1): ')
            if ('N'.equalsIgnoreCase(answer)) {
                promptSessionCreator(sandboxInfo)
            } else {
                answer = answer ?: '1'
            }
        }
        def sessionIndex = Integer.parseInt(answer?.trim()) - 1
        def session = sessions[sessionIndex]
//        printMsg("$session.instanceType.name: [ $session.status ]")
        def sessionStatus = joinSession(session.path).status
        switch (sessionStatus) {
            case 200:
                if (session.status == 'ACTIVE') {
                    this.exit("Session $session.id correctly validated", session.id, false)
                } else if (session.status == 'STARTING') {
                    waitUntilAvailable(session.id)
                } else {
                    this.exit("Session $session.id not available", 0)
                }
                break
            case 202:
                waitUntilAvailable(session.id)
                break
            default:
                this.exit("Session $session.idnot found. $sessionStatus", 0)
        }
    } catch (Exception ex) {
        this.exit("Invalid option selected: $answer", 0)
    }
}

def waitUntilAvailable(sessionId) {
    Thread.sleep(3000)
    printMsg('Session not available(yet)')
    def sessionRawInfo = this.joinSession("sandbox/$user/session/$sessionId") // TODO: Change
    def sessionStatus = sessionRawInfo.status
    def sessionInfo = sessionRawInfo.data
    switch (sessionStatus) {
        case 200:
            if (sessionInfo?.status?.toString()?.toLowerCase() == 'alive') {
                this.exit("Session $sessionId available", sessionId, false)
            } else if (sessionInfo?.status?.toString()?.toLowerCase() == 'requested') {
                waitUntilAvailable(sessionId)
            } else {
                this.exit("Session $sessionId not available", 0)
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

def promptSessionCreator(def sandboxInfo) {
    def instanceTypes = sandboxInfo.instanceTypes
    if (instanceTypes.size() > 1 && !silent) {
        promptInstanceTypeSelection(instanceTypes)
    } else {
        printMsg('Generating a new session')
        def instanceType = instanceTypes.first()
        requestSession(instanceType.path).data
        printMsg('Session Created')
        this.routine()
    }
}

def promptInstanceTypeSelection(def availableInstances) {
    def answer = '1'
    try {
        if (!silent) {
            this.listInstancesType(availableInstances)
            answer = readLine(' > Select an instance type(1): ')
            answer = answer ?: '1'
        }
        def typeIndex = Integer.parseInt(answer.trim()) - 1
        def selectedInstanceType = availableInstances[typeIndex]
        requestSession(selectedInstanceType.requestUrl).data
        routine()
    } catch (Exception ex) {
        this.exit("Invalid type selected $ex", 0)
    }
}

private String readLine(String prompt) {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in))
    print prompt
    br.readLine()
}
