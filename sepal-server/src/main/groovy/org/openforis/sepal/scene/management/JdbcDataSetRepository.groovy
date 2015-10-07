package org.openforis.sepal.scene.management

import groovy.sql.Sql
import org.openforis.sepal.metadata.MetadataProvider
import org.openforis.sepal.metadata.crawling.MetadataCrawlingCriteria
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.transaction.SqlConnectionProvider

interface DataSetRepository {

    boolean containsDataSetWithId(int id)
    List<MetadataProvider> getMetadataProviders()
    def updateCrawlingStartTime(int providerId, Date starTime)
    def updateCrawlingEndTime(int providerId, Date endTime)

}

class JdbcDataSetRepository implements DataSetRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcDataSetRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    boolean containsDataSetWithId(int id) {
        def row = sql.firstRow('SELECT * FROM data_set WHERE id = ? AND dataset_active = 1', [id])
        return row != null
    }

@Override
    List<MetadataProvider> getMetadataProviders() {
        List<MetadataProvider> providers = new ArrayList<MetadataProvider>()
        sql.eachRow('''
            SELECT mp.id,mp.name,mp.crawling_entrypoint,mp.iterations,mp.iteration_size,
            mp.last_execution_start,mp.last_execution_end,ds.id AS datasetId,mcc.criteria_id,mcc.field_name,mcc.expected_value
            FROM metadata_providers mp
            INNER JOIN data_set ds ON mp.id = ds.metadata_provider
            LEFT OUTER JOIN metadata_crawling_criteria mcc ON mp.id = mcc.metadata_provider_id
            WHERE mp.active = 1 AND ds.dataset_active = 1
            ORDER by ds.id ASC
          '''
          ){
            mapMetadataProvider(it,providers)
          }

        return providers;
    }

    @Override
    def updateCrawlingStartTime(int providerId, Date starTime) {
        sql.executeUpdate('UPDATE metadata_providers SET last_execution_start = ? WHERE id = ?',[starTime,providerId])
    }

    @Override
    def updateCrawlingEndTime(int providerId, Date endTime) {
        sql.executeUpdate('UPDATE metadata_providers SET last_execution_end = ? WHERE id = ?',[endTime,providerId])
    }

    private def mapMetadataProvider(row, List<MetadataProvider> providers){
        def provider = new MetadataProvider(
                id: row.id, name: row.name,active: true,entrypoint: row.crawling_entrypoint,iterations: row.iterations, iterationSize: row.iteration_size,
                lastStartTime: row.last_execution_start, lastEndTime: row.last_execution_end
        )

        def providerInList = providers.find { it.id == provider.id }
        if (providerInList){
            provider = providerInList
        }else{
            providers.add(provider)
        }

        def dataSetInList = providers.dataSets.find{ it.id ==  row.datasetId}
        if ( ! (dataSetInList)){
            provider.dataSets.add(DataSet.byId(row.datasetId))
        }
        if (row.criteria_id){
            def criteriaInList = providers.crawlingCriterias.find{it.criteriaId == row.criteria_id }
            if (!(criteriaInList)){
                provider.crawlingCriterias.add(new MetadataCrawlingCriteria(row.criteria_id, row.field_name,row.expected_value))
            }
        }


    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
