using './main.bicep'

// Example parameter file used by deploy.sh. Non-secret values have example defaults that an
// environment variable overrides. Secrets are read from environment variables only, so they
// never appear in this file, on a command line, or in shell history.

param location = readEnvironmentVariable('LOCATION', 'eastus2')
param namePrefix = readEnvironmentVariable('NAME_PREFIX', 'shrink')
param imageTag = readEnvironmentVariable('IMAGE_TAG', 'latest')
param krogerLocationId = readEnvironmentVariable('KROGER_LOCATION_ID')
param krogerLocationLabel = readEnvironmentVariable('KROGER_LOCATION_LABEL', 'one Kroger store')
param corsOrigins = readEnvironmentVariable('CORS_ORIGINS', '["https://karmanyaiyer.com"]')
param refreshCron = readEnvironmentVariable('REFRESH_CRON', '0 11 * * *')
param otelExporterOtlpEndpoint = readEnvironmentVariable('OTEL_EXPORTER_OTLP_ENDPOINT', '')

param databaseUrl = readEnvironmentVariable('DATABASE_URL')
param deepseekApiKey = readEnvironmentVariable('DEEPSEEK_API_KEY')
param krogerClientId = readEnvironmentVariable('KROGER_CLIENT_ID')
param krogerClientSecret = readEnvironmentVariable('KROGER_CLIENT_SECRET')
param visitorHashSalt = readEnvironmentVariable('VISITOR_HASH_SALT')
param otelExporterOtlpHeaders = readEnvironmentVariable('OTEL_EXPORTER_OTLP_HEADERS', '')
