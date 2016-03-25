package org.openforis.sepal.sshgateway

import com.ocpsoft.pretty.time.PrettyTime
import com.ocpsoft.pretty.time.units.*
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.text.DecimalFormat

class Interactive {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private final SepalClient sepalClient
    private final SshSessionCommand sessionCommand

    Interactive(String username, String sepalEndpoint, File privateKey, File output, String password) {
        sepalClient = new SepalClient(username, sepalEndpoint, password)
        sessionCommand = new SshSessionCommand(privateKey, output)
        if (!privateKey.exists())
            throw new IllegalArgumentException("Non-existing private key: $privateKey")
        if (!privateKey.canRead())
            throw new IllegalArgumentException("Non-readable private key: $privateKey")
    }

    void start() {
        def sandboxInfo = sepalClient.loadSandboxInfo()

        printUsageBudget(sandboxInfo)
        BudgetChecker.assertWithinBudget(sandboxInfo)
        if (sandboxInfo.sessions)
            promptJoin(sandboxInfo)
        else
            promptCreate(sandboxInfo)
    }

    private printUsageBudget(info) {
        println '\n' +
                '------------------\n' +
                '- Monthly budget -\n' +
                '------------------\n'
        println("Instance spending/budget:".padRight(26) + "${budget(info.monthlyInstanceSpending, info.monthlyInstanceBudget)} USD")
        println("Storage spending/budget:".padRight(26) + "${budget(info.monthlyStorageSpending, info.monthlyStorageBudget)} USD")
        println("Storage used/quota:".padRight(26) + "${budget(info.storageUsed, info.storageQuota)} GB")
    }

    private String budget(Number spending, Number budget) {
        def format = new DecimalFormat('##,###.##')
        return "${format.format(spending)}/${format.format(budget)}"
    }

    private void promptJoin(Map sandboxInfo) {
        println '\n' +
                '----------------\n' +
                '- Join session -\n' +
                '----------------\n'
        def sessionsByStatus = sandboxInfo.sessions.groupBy { it.status }
        def activeSessions = sessionsByStatus.ACTIVE as List<Map>
        def startingSessions = sessionsByStatus.STARTING as List<Map>
        def sessions = [] as List<Map>
        if (activeSessions) {
            println 'Active sessions:'
            activeSessions.each {
                sessions << it
                printSessionOptionLine(sessions.size(), it)
            }
            println()
        }
        if (startingSessions) {
            println 'Sessions starting up:'
            startingSessions.each {
                sessions << it
                printSessionOptionLine(sessions.size(), it)
            }
            println()
        }
        println 'c'.padRight(6) + 'Create new session'
        println 't'.padRight(6) + 'Terminate session'
        println()
        readJoinSelection(sandboxInfo, sessions)
    }

    private printSessionOptionLine(int option, Map session) {
        print String.valueOf(option).padRight(6)
        print timeSinceCreation(session).padRight(15)
        println "(${session.instanceType.name}, ${session.instanceType.hourlyCost} USD/hour)"
    }

    private void readJoinSelection(Map sandboxInfo, List<Map> sessions) {
        def selection = readLine('Select (1): ')
        if (!selection)
            selection = '1'

        if (selection.isNumber()) {
            def selectedSessionIndex = (selection as int) - 1
            if (selectedSessionIndex >= sessions.size() || selectedSessionIndex < 0) {
                println "  Invalid option: $selection"
                readJoinSelection(sandboxInfo, sessions)
                return
            }
            joinSession(sessions[selectedSessionIndex])
        } else {
            if ('c' == selection)
                promptCreate(sandboxInfo)
            else if ('t' == selection)
                promptTerminate(sandboxInfo)
            else {
                println "  Invalid option: $selection"
                readJoinSelection(sandboxInfo, sessions)
            }
        }
    }

    private void joinSession(Map session) {
        if (session.status == 'STARTING')
            print '\nSession is starting. This might start a new server, which would take several minutes.\nPlease wait...'
        def joinedSession = sepalClient.joinSession(session) {
            print '.'
        }
        if (session.status == 'STARTING')
            println('\n')
        sessionCommand.write(joinedSession)
    }

    private void promptCreate(Map sandboxInfo) {
        println '\n' +
                '----------------------\n' +
                '- Create new session -\n' +
                '----------------------\n'
        def types = sandboxInfo.instanceTypes as List<Map>
        types.eachWithIndex { type, i ->
            printInstanceTypeOption(i + 1, type)
        }
        if (sandboxInfo.sessions) {
            println()
            println 'j'.padRight(6) + 'Join existing session'
            println 't'.padRight(6) + 'Terminate session'
        }
        println()
        readCreateSelection(sandboxInfo)
    }

    private void printInstanceTypeOption(int option, Map type) {
        print String.valueOf(option).padRight(6)
        println "$type.name, $type.hourlyCost USD/h"
    }

    private void readCreateSelection(Map sandboxInfo) {
        def instanceTypes = sandboxInfo.instanceTypes as List<Map>
        def selection = readLine('Select (1): ')
        if (!selection)
            selection = '1'

        if (selection.isNumber()) {
            def selectedIndex = (selection as int) - 1
            if (selectedIndex >= instanceTypes.size() || selectedIndex < 0) {
                println "  Invalid option: $selection"
                readCreateSelection(sandboxInfo)
                return
            }
            createSession(instanceTypes[selectedIndex])
        } else {
            if ('j' == selection && sandboxInfo.sessions)
                promptJoin(sandboxInfo)
            else if ('t' == selection && sandboxInfo.sessions)
                promptTerminate(sandboxInfo)
            else {
                println "  Invalid option: $selection"
                readCreateSelection(sandboxInfo)
            }
        }
    }

    private void createSession(Map instanceType) {
        print '\nSession is starting. This might start a new server, which would take several minutes.\nPlease wait...'
        def session = sepalClient.createSession(instanceType) {
            print '.'
        }
        println('\n')
        sessionCommand.write(session)
    }

    private void promptTerminate(Map sandboxInfo) {
        println '\n' +
                '---------------------\n' +
                '- Terminate session -\n' +
                '---------------------\n'
        def sessions = sandboxInfo.sessions as List<Map>
        sessions.eachWithIndex { session, i ->
            printSessionOptionLine(i + 1, session)
        }
        println()
        println 'c'.padRight(6) + 'Create new session'
        println 'j'.padRight(6) + 'Join existing session'
        println()
        readTerminateSelection(sandboxInfo)
    }

    private void readTerminateSelection(Map sandboxInfo) {
        def selection = readLine('Select (1): ')
        if (!selection)
            selection = '1'

        def sessions = sandboxInfo.sessions as List<Map>
        if (selection.isNumber()) {
            def selectedSessionIndex = (selection as int) - 1
            if (selectedSessionIndex >= sessions.size() || selectedSessionIndex < 0) {
                println "  Invalid option: $selection"
                readTerminateSelection(sandboxInfo)
                return
            }
            terminate(sandboxInfo, selectedSessionIndex)
            if (sandboxInfo.sessions)
                promptTerminate(sandboxInfo)
            else
                promptCreate(sandboxInfo)
        } else {
            if ('c' == selection)
                promptCreate(sandboxInfo)
            else if ('j' == selection)
                promptJoin(sandboxInfo)
            else {
                println "  Invalid option: $selection"
                readTerminateSelection(sandboxInfo)
            }
        }
    }

    private void terminate(Map sandboxInfo, int indexOfSessionToTerminate) {
        print '\nWaiting for session to terminate...'
        def session = sandboxInfo.sessions.remove(indexOfSessionToTerminate) as Map
        sepalClient.terminate(session)
        print '\nSession successfully terminated.'
    }

    private String timeSinceCreation(Map session) {
        def locale = Locale.getDefault()
        def prettyTime = new PrettyTime(units: [
                new Second(locale),
                new Minute(locale),
                new Hour(locale),
                new Day(locale),
                new Week(locale),
                new Month(locale)
        ])
        prettyTime.format(Date.parse("yyyy-MM-dd'T'HH:mm:ss", session.creationTime as String))
    }

    private String readLine(String prompt) {
        print prompt
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in))
        def result = br.readLine()
        println()
        return result?.trim()?.toLowerCase()
    }

    static void main(String[] args) {
        if (args.size() != 5)
            throw new IllegalArgumentException("Expects five arguments: username, sepal-server REST endpoint, " +
                    "private key path, and output path, and sepalAdmin password")
        try {
            new Interactive(args[0], args[1], new File(args[2]), new File(args[3]), args[4]).start()
        } catch (Exception e) {
            LOG.error("Interactive failed", e)
            System.err.println("\nSomething went wrong, please try again")
            System.exit(1)
        }
    }
}
