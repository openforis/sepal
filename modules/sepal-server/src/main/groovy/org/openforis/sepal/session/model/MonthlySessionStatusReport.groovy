package org.openforis.sepal.session.model

import groovy.transform.ToString


@ToString
class MonthlySessionStatusReport {

    String username
    private Double totalAmountUsed = 0
    List<SepalSession> monthlySessions = []

    MonthlySessionStatusReport() {

    }

    MonthlySessionStatusReport(String username) {
        this()
        this.username = username
    }

    void addMonthlySession(SepalSession session) {
        monthlySessions.add(session)
        totalAmountUsed = totalAmountUsed + session?.costs
    }

    Double getTotalAmountUsed() { totalAmountUsed }


}
