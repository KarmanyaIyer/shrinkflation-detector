// Azure resources for the Shrinkflation Detector, deployed at resource group scope.
// Postgres is not created here. It runs on Neon and is passed in as databaseUrl.
// The image is public on GHCR, so no registry credentials are configured.

@description('Region for all resources. Defaults to the resource group region.')
param location string = resourceGroup().location

@minLength(3)
@maxLength(20)
@description('Prefix for resource names. Lowercase letters, digits, and hyphens.')
param namePrefix string = 'shrink'

@description('Tag of ghcr.io/karmanyaiyer/shrinkflation-detector to run, for example latest or sha-1a2b3c4.')
param imageTag string = 'latest'

@secure()
@description('SQLAlchemy URL for Postgres, for example postgresql+psycopg://user:pass@host/db?sslmode=require')
param databaseUrl string

@secure()
@description('DeepSeek API key.')
param deepseekApiKey string

@secure()
@description('Kroger Public API client id.')
param krogerClientId string

@secure()
@description('Kroger Public API client secret.')
param krogerClientSecret string

@description('8 digit Kroger locationId of the tracked store.')
param krogerLocationId string

@description('How the site describes the tracked store.')
param krogerLocationLabel string = 'one Kroger store'

@description('Allowed CORS origins as a JSON array string, which is how pydantic-settings parses list fields. Example: ["https://karmanyaiyer.com"]')
param corsOrigins string = '["https://karmanyaiyer.com"]'

@secure()
@description('Salt for hashing visitor IPs in the ask endpoint budget.')
param visitorHashSalt string

@description('Cron expression (UTC) for the refresh job. Default 11:00 UTC daily.')
param refreshCron string = '0 11 * * *'

@description('OTLP/HTTP base URL for trace export, for example https://otlp.example.com. Empty disables export. See README.md.')
param otelExporterOtlpEndpoint string = ''

@secure()
@description('Optional OTLP headers for an authenticated collector, as comma separated key=value pairs.')
param otelExporterOtlpHeaders string = ''

var image = 'ghcr.io/karmanyaiyer/shrinkflation-detector:${imageTag}'

var appSecrets = concat(
  [
    { name: 'database-url', value: databaseUrl }
    { name: 'deepseek-api-key', value: deepseekApiKey }
    { name: 'kroger-client-id', value: krogerClientId }
    { name: 'kroger-client-secret', value: krogerClientSecret }
    { name: 'visitor-hash-salt', value: visitorHashSalt }
  ],
  empty(otelExporterOtlpHeaders) ? [] : [{ name: 'otel-exporter-otlp-headers', value: otelExporterOtlpHeaders }]
)

// Variable names match the fields in backend/src/shrinkflation/config.py.
// OTEL_EXPORTER_OTLP_ENDPOINT is only set when an endpoint is given; the app default is empty,
// which creates spans without exporting them.
var pipelineEnv = concat(
  [
    { name: 'DATABASE_URL', secretRef: 'database-url' }
    { name: 'DEEPSEEK_API_KEY', secretRef: 'deepseek-api-key' }
    { name: 'KROGER_CLIENT_ID', secretRef: 'kroger-client-id' }
    { name: 'KROGER_CLIENT_SECRET', secretRef: 'kroger-client-secret' }
    { name: 'KROGER_LOCATION_ID', value: krogerLocationId }
    { name: 'KROGER_LOCATION_LABEL', value: krogerLocationLabel }
    { name: 'ENVIRONMENT', value: 'production' }
  ],
  empty(otelExporterOtlpEndpoint) ? [] : [{ name: 'OTEL_EXPORTER_OTLP_ENDPOINT', value: otelExporterOtlpEndpoint }],
  empty(otelExporterOtlpHeaders) ? [] : [{ name: 'OTEL_EXPORTER_OTLP_HEADERS', secretRef: 'otel-exporter-otlp-headers' }]
)

var apiEnv = concat(pipelineEnv, [
  { name: 'CORS_ORIGINS', value: corsOrigins }
  { name: 'VISITOR_HASH_SALT', secretRef: 'visitor-hash-salt' }
])

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    // Caps ingestion so a log flood costs at most about 25 GB of paid ingestion in a month.
    workspaceCapping: {
      dailyQuotaGb: 1
    }
  }
}

// Not used by the app yet. See README.md for the two ways to send traces here.
resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    IngestionMode: 'LogAnalytics'
  }
}

// Consumption only environment: no workload profiles, no VNet, billed per second of replica time.
resource env 'Microsoft.App/managedEnvironments@2026-01-01' = {
  name: '${namePrefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
    zoneRedundant: false
  }
}

resource api 'Microsoft.App/containerApps@2026-01-01' = {
  name: '${namePrefix}-api'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'api'
          image: image
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: apiEnv
          probes: [
            {
              type: 'Readiness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 3
              periodSeconds: 10
              failureThreshold: 3
            }
            {
              type: 'Liveness'
              httpGet: {
                path: '/api/health'
                port: 8000
                scheme: 'HTTP'
              }
              initialDelaySeconds: 10
              periodSeconds: 30
              failureThreshold: 3
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 1
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '20'
              }
            }
          }
        ]
      }
    }
  }
}

resource refreshJob 'Microsoft.App/jobs@2026-01-01' = {
  name: '${namePrefix}-refresh'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 3600
      replicaRetryLimit: 1
      scheduleTriggerConfig: {
        cronExpression: refreshCron
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: appSecrets
    }
    template: {
      containers: [
        {
          name: 'refresh'
          image: image
          command: ['shrink', 'refresh']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: pipelineEnv
        }
      ]
    }
  }
}

resource migrateJob 'Microsoft.App/jobs@2026-01-01' = {
  name: '${namePrefix}-migrate'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'database-url', value: databaseUrl }
      ]
    }
    template: {
      containers: [
        {
          name: 'migrate'
          image: image
          command: ['shrink', 'migrate']
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'ENVIRONMENT', value: 'production' }
          ]
        }
      ]
    }
  }
}

output apiFqdn string = api.properties.configuration.ingress.fqdn
output apiUrl string = 'https://${api.properties.configuration.ingress.fqdn}'
output environmentName string = env.name
output apiName string = api.name
output refreshJobName string = refreshJob.name
output migrateJobName string = migrateJob.name
output appInsightsName string = insights.name
output logAnalyticsWorkspaceId string = logs.id
