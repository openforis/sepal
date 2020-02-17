package org.openforis.sepal.sshgateway

import com.ocpsoft.pretty.time.Duration
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
        promptCreate(sandboxInfo)
    }

    private printUsageBudget(info) {
        println("Instance spending:".padRight(19) +
            format("${budget(info.spending.monthlyInstanceSpending, info.spending.monthlyInstanceBudget)} USD", PURPLE_INTENSE))
        println("Storage spending:".padRight(19) +
            format("${budget(info.spending.monthlyStorageSpending, info.spending.monthlyStorageBudget)} USD", PURPLE_INTENSE))
        println("Storage used:".padRight(19) +
            format("${budget(info.spending.storageUsed, info.spending.storageQuota)} GB", PURPLE_INTENSE))
        println()
    }

    private String budget(Number spending, Number budget) {
        def percentage = Math.round(100 * spending / budget)
        def decimalFormat = new DecimalFormat('##,###.##')
        return "${percentage.toString().padLeft(3)}% of ${decimalFormat.format(budget)}"
    }

    private void joinSelected(Map sandboxInfo, selection) {
        def selectedSessionIndex = (selection as int) - 1
        joinSession(sandboxInfo.sessions[selectedSessionIndex])
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
        def types = sandboxInfo.instanceTypes as List<Map>
        def rows = instanceTypeRows(types)
        if (!sandboxInfo.sessions.empty) {
            rows.addAll(sessionRows(sandboxInfo.sessions))
        }
        print(new AsciiTable(rows))
        println()
        if (sandboxInfo.sessions) {
            println("Enter ${highlight('Type')}, ${highlight('ID')}, or ${highlight('ID')}+${highlight('s')}.")
            println()
            println("Examples:")
            println("  ${highlight('t1')}    start a t1 instance")
            println("  ${highlight('1')}     join session #1")
            println("  ${highlight('1s')}    stop session #1")
        } else {
            println("Enter ${highlight('Type')} of instance to start.")
            println()
            println("Example:")
            println("  ${highlight('t1')} - start a t1 instance")
        }
        println()
        readSelection(sandboxInfo)
    }

    private List sessionRows(List<Map> sessions) {
        def rows = [
            th([
                td(value: 'Active sessions', colSpan: 4, styles: [BOLD, GREEN])
            ]),
            th([
                td(value: 'ID', styles: [BOLD], align: 'right'),
                td(value: 'Type', styles: [BOLD]),
                td(value: 'Time', styles: [BOLD], align: 'right'),
                td(value: 'USD', styles: [BOLD], align: 'right')
            ])
        ]
        def options = sessions.withIndex().collect { Map session, i ->
            tr([
                td(value: i + 1, styles: [YELLOW_INTENSE]),
                td(value: session.instanceType.tag),
                td(value: timeSinceCreation(session), align: 'right'),
                td(value: totalCost(session), align: 'right')
            ])
        }
        rows.addAll(options)
        return rows
    }

    private List instanceTypeRows(List<Map> types) {
        def rows = [
            th([
                td(value: 'Available instance types', colSpan: 4, styles: [BOLD, GREEN])
            ]),
            th([
                td(value: 'Type', styles: [BOLD]),
                td(value: 'CPU', styles: [BOLD], align: 'right'),
                td(value: 'GB RAM', styles: [BOLD], align: 'right'),
                td(value: 'USD/h', styles: [BOLD], align: 'right')
            ])
        ]
        def options = types.withIndex().collect { type, i ->
            tr([
                td(value: type.tag, styles: [YELLOW_INTENSE]),
                td(value: type.cpuCount),
                td(value: type.ramGiB),
                td(value: String.format('%.2f', type.hourlyCost), align: 'right')
            ])
        }
        rows.addAll(options)
        return rows
    }

    private void readSelection(Map sandboxInfo) {
        def defaultSelection = getDefaultSelection(sandboxInfo)
        def selection = readLine("Select (${highlight(defaultSelection, YELLOW_INTENSE)}): ")
        if (!selection)
            selection = defaultSelection

        if (isStart(sandboxInfo, selection)) {
            startSelected(sandboxInfo, selection)
        } else if (isJoin(sandboxInfo, selection)) {
            joinSelected(sandboxInfo, selection)
        } else if (isStop(sandboxInfo, selection)) {
            stopSelected(sandboxInfo, selection)
        } else {
            println "  Invalid option: $selection"
            println()
            readSelection(sandboxInfo)
        }
    }

    private void startSelected(sandboxInfo, selection) {
        def selectedInstanceType = getSelectedInstanceType(sandboxInfo, selection)
        if (!selectedInstanceType) {
            println "  Invalid option: $selection"
            println()
            readSelection(sandboxInfo)
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

    private String highlight(text, Style style = YELLOW_INTENSE) {
        format(text, style)
    }

    private void stopSelected(Map sandboxInfo, selection) {
        def selectedSessionIndex = stopToSessionIndex(selection)
        terminate(sandboxInfo, selectedSessionIndex)
        promptCreate(sandboxInfo)
    }

    private void terminate(Map sandboxInfo, int indexOfSessionToTerminate) {
        print '\nWaiting for session to terminate...'
        def session = sandboxInfo.sessions.remove(indexOfSessionToTerminate) as Map
        sepalClient.terminate(session)
        print '\nSession successfully terminated.\n'
    }

    private Duration getDuration(session) {
        def locale = Locale.getDefault()
        def prettyTime = new PrettyTime([units: [
            new Second(locale),
            new Minute(locale),
            new Hour(locale),
            new Day(locale),
            new Week(locale)
        ]])
        return prettyTime.approximateDuration(getSessionDate(session))
    }

    private Date getSessionDate(Map<?, ?> session) {
        new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").parse(session.creationTime as String)
    }

    private String totalCost(Map session) {
        def cost = session.instanceType.hourlyCost * ((getSessionDate(session) - new Date()).abs() * 24d)
        String.format('%.2f', cost)
    }

    private String timeSinceCreation(Map session) {
        def duration = getDuration(session)
        return "${duration.quantity.abs()}${dateUnit(duration)}"
    }

    private String dateUnit(Duration duration) {
        switch (duration.unit.name) {
            case 'second': return 's'
            case 'minute': return 'm'
            case 'hour': return 'h'
            case 'day': return 'd'
            case 'week': return 'w'
        }
    }

    private String readLine(String prompt) {
        print prompt
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in))
        def result = br.readLine()
        println()
        return result?.trim()?.toLowerCase()
    }

    private String getDefaultSelection(Map info) {
        info.sessions.empty
            ? info.instanceTypes.first().tag
            : '1'
    }

    private Map getSelectedInstanceType(Map info, String tag) {
        info.instanceTypes.find { it.tag == tag } as Map
    }

    private boolean isStart(Map sandboxInfo, String selection) {
        selection in sandboxInfo.instanceTypes.collect { it.tag }
    }

    private boolean isJoin(Map sandboxInfo, String selection) {
        try {
            return (selection as int) in sandboxInfo.sessions.withIndex().collect { _, i -> i + 1 }
        } catch (Exception e) {
            return false
        }
    }

    private boolean isStop(Map sandboxInfo, String selection) {
        try {
            if (!selection.endsWith('s'))
                return false
            return stopToSessionIndex(selection) in sandboxInfo.sessions.withIndex().collect { _, i -> i }
        } catch (Exception e) {
            return false
        }
    }

    private int stopToSessionIndex(selection) {
        (selection.substring(0, selection.length() - 1) as int) - 1
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
