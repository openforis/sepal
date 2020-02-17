package org.openforis.sepal.sshgateway

import com.ocpsoft.pretty.time.PrettyTime
import com.ocpsoft.pretty.time.units.*
import org.slf4j.Logger
import org.slf4j.LoggerFactory

import java.text.DecimalFormat
import java.text.SimpleDateFormat

import static org.openforis.sepal.sshgateway.AsciiTable.*
import static org.openforis.sepal.sshgateway.Style.*

class Interactive {
    private static final Logger LOG = LoggerFactory.getLogger(this)
    private static final int CONFIRM_WHEN_LESS_THAN_HOURS = 10
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
        sandboxInfo.instanceTypes = sandboxInfo.instanceTypes.findAll { it.tag }

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
        println("Instance spending/budget:".padRight(26) + "${budget(info.spending.monthlyInstanceSpending, info.spending.monthlyInstanceBudget)} USD")
        println("Storage spending/budget:".padRight(26) + "${budget(info.spending.monthlyStorageSpending, info.spending.monthlyStorageBudget)} USD")
        println("Storage used/quota:".padRight(26) + "${budget(info.spending.storageUsed, info.spending.storageQuota)} GB")
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
        println format('c', BLUE).padRight(6) + 'Create new session'
        println format('t', BLUE).padRight(6) + 'Terminate session'
        println()
        readJoinSelection(sandboxInfo, sessions)
    }

    private printSessionOptionLine(int option, Map session) {
        print String.valueOf(option).padRight(6)
        print timeSinceCreation(session).padRight(15)
        println "(${session.instanceType.name}, ${session.instanceType.description}, ${session.instanceType.hourlyCost} USD/h)"
    }

    private void readJoinSelection(Map sandboxInfo, List<Map> sessions) {
        def selection = readLine("Select (${format(1, BLUE)}): ")
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
        printInstanceTypes(types)
        if (sandboxInfo.sessions) {
            println('Start session by entering an ID, or manage existing sessions:')
            println()
            println format('j', BLUE).padRight(6) + 'Join existing session'
            println format('t', BLUE).padRight(6) + 'Terminate session'
        } else {
            println('Start session by entering an ID:')
        }
        println()
        readCreateSelection(sandboxInfo)
    }

    private void printInstanceTypes(List<Map> types) {
        def rows = [
            hr([
                td(value: 'Available instance types', colSpan: 4, styles: [BOLD, GREEN])
            ]),
            hr([
                td(value: 'ID', width: 5, styles: [BOLD]),
                td(value: 'CPU', width: 3, styles: [BOLD]),
                td(value: 'GB RAM', width: 6, styles: [BOLD]),
                td(value: 'USD/h', width: 5, styles: [BOLD])
            ])
        ]
        def options = types.withIndex().collect { type, i ->
            tr([
                td(value: type.tag, styles: [BLUE]),
                td(value: type.cpuCount),
                td(value: type.ramGiB),
                td(value: String.format('%.2f', type.hourlyCost), align: 'right')
            ])
        }
        rows.addAll(options)
        println(new AsciiTable(rows))
    }

    private void readCreateSelection(Map sandboxInfo) {
        def defaultTag = getDefaultTag(sandboxInfo)
        def selection = readLine("Select (${format(defaultTag, BLUE)}): ")
        if (!selection)
            selection = defaultTag

        if (isTag(selection)) {
            def selectedInstanceType = getSelectedInstanceType(sandboxInfo, selection)
            if (!selectedInstanceType) {
                println "  Invalid option: $selection"
                readCreateSelection(sandboxInfo)
                return
            }
            def spendingLeft = sandboxInfo.spending.monthlyInstanceBudget - sandboxInfo.spending.monthlyInstanceSpending
            def hoursLeft = Math.floor(spendingLeft / selectedInstanceType.hourlyCost) as int
            if (hoursLeft <= 0) {
                println("You don't have enough resources to run this session. Please consider " +
                    "reducing the size of your selected instance, or contact a SEPAL administrator to increase " +
                    "your resource limits.\n\n")
                promptCreate(sandboxInfo)
                return
            }
            println("You can run this session for $hoursLeft hours. If you require more processing time, please consider " +
                "reducing the size of your selected instance, or contact a SEPAL administrator to increase " +
                "your resource limits.")
            if (hoursLeft <= CONFIRM_WHEN_LESS_THAN_HOURS)
                confirmSessionCreation(sandboxInfo, selectedInstanceType)
            else {
                createSession(selectedInstanceType)
            }
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

    private void confirmSessionCreation(sandboxInfo, instanceType) {
        def selection = readLine("\nAre you sure you want to continue (y/N): ")
        if (selection.equals('y'))
            createSession(instanceType)
        else
            promptCreate(sandboxInfo)
    }

    private void createSession(Map instanceType) {
        print '\nSession is starting. This might start a new server, which could take several minutes.\nPlease wait...'
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
        println format('c', BLUE).padRight(6) + 'Create new session'
        println format('j', BLUE).padRight(6) + 'Join existing session'
        println()
        readTerminateSelection(sandboxInfo)
    }

    private void readTerminateSelection(Map sandboxInfo) {
        def selection = readLine("Select (${format(1, BLUE)}): ")
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
        print '\nSession successfully terminated.\n'
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
        prettyTime.format(new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").parse(session.creationTime as String))
    }

    private String readLine(String prompt) {
        print prompt
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in))
        def result = br.readLine()
        println()
        return result?.trim()?.toLowerCase()
    }

    private String getDefaultTag(Map info) {
        info.instanceTypes.first().tag
    }

    private Map getSelectedInstanceType(Map info, String tag) {
        info.instanceTypes.find { it.tag == tag } as Map
    }

    private boolean isTag(String tag) {
        tag && tag.length() > 1
    }

    static void main(String[] args) {
        if (args.size() != 5)
            throw new IllegalArgumentException("Expects five arguments: username, sepal-server REST endpoint, " +
                "private key path, output path, and sepalAdmin password")
        try {
            new Interactive(args[0], args[1], new File(args[2]), new File(args[3]), args[4]).start()
        } catch (Exception e) {
            LOG.error("Interactive failed", e)
            System.err.println("\nSomething went wrong, please try again")
            System.exit(1)
        }
    }
}
