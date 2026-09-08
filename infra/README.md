# Azure deployment

Bicep templates and scripts that run the backend on Azure Container Apps. The frontend is a
static build (`frontend/dist`) served elsewhere and is not part of this template.

## What gets created

All names use the `namePrefix` parameter (default `shrink`) in one resource group.

| Resource | Name | Purpose |
| --- | --- | --- |
| Log Analytics workspace | `shrink-logs` | Console and system logs from the environment. 30 day retention, 1 GB per day ingestion cap. |
| Application Insights | `shrink-insights` | Created for trace export. Nothing is sent to it yet, see Tracing below. |
| Container Apps environment | `shrink-env` | Consumption only. No VNet, no workload profiles. |
| Container App | `shrink-api` | FastAPI on port 8000, external HTTPS ingress, 0.25 vCPU / 0.5 GiB, 0 to 1 replicas, scales on 20 concurrent requests. |
| Container Apps Job | `shrink-refresh` | `shrink refresh` on a cron schedule (default `0 11 * * *`, 11:00 UTC daily). Timeout 3600 s, 1 retry. |
| Container Apps Job | `shrink-migrate` | `shrink migrate`, manual trigger. Started by the deploy workflow before each API update. |

Postgres is not created. The template expects a Neon database URL. The image is
`ghcr.io/karmanyaiyer/shrinkflation-detector:<imageTag>`, built and pushed by `.github/workflows/ci.yml`.

Secrets (`databaseUrl`, `deepseekApiKey`, `krogerClientId`, `krogerClientSecret`,
`visitorHashSalt`, `otelExporterOtlpHeaders`) are stored as Container Apps secrets and exposed to
the containers as environment variables named after the fields in `backend/src/shrinkflation/config.py`.
`corsOrigins` must be a JSON array string because pydantic-settings parses list fields as JSON.

## Monthly cost estimate

Prices are the public pay-as-you-go rates as of September 2026 (US regions) and change over
time. The compute estimate assumes a 30 day month.

| Item | Typical month | Basis |
| --- | --- | --- |
| Container Apps environment | $0 | No charge for a consumption environment itself. |
| `shrink-api` compute | $0 | Free grant per subscription: 180,000 vCPU-s and 360,000 GiB-s per month. A replica that is active 2 h per day uses 0.25 x 7,200 x 30 = 54,000 vCPU-s and 108,000 GiB-s. Scaled to zero costs nothing. |
| `shrink-api` worst case | about $14 | Active 24 h per day: 648,000 vCPU-s and 1,296,000 GiB-s. After the grant: 468,000 x $0.000024 + 936,000 x $0.000003 = $11.23 + $2.81. |
| `shrink-refresh` compute | $0 | At most 3,600 s per day at 0.25 vCPU: 27,000 vCPU-s and 54,000 GiB-s per month, inside the grant. |
| `shrink-migrate` compute | $0 | Seconds per deploy. |
| HTTP requests | $0 | 2 million requests per month free, then $0.40 per million. |
| Log Analytics | $0 | First 5 GB per billing account per month free, then $2.30 per GB. Expected volume is under 100 MB. The 1 GB daily cap bounds a bad month at (30 - 5) x $2.30 = $57.50. |
| Application Insights | $0 | No separate charge. Data it receives is billed as Log Analytics ingestion. Nothing is sent until tracing is wired up. |
| Neon Postgres | $0 | Free plan: 100 CU-hours per project per month, 0.5 GB storage, compute scales to zero after 5 minutes. Expected: about 2.5 h per day awake at 0.25 CU = 19 CU-hours. Snapshot rows are only written on change, so storage stays well under 0.5 GB in year one. |
| GHCR | $0 | Public packages are free. |
| Egress | $0 | First 100 GB per month of internet egress is free. |
| Total | $0, up to about $14 if the API is active around the clock | |

Setting `minReplicas` to 1 to avoid cold starts would add idle charges, which the free grant
does not cover: 0.25 x 2,592,000 x $0.000008 + 0.5 x 2,592,000 x $0.000001 = about $6.50 per month.

## First deploy, in order

1. Create a Neon project and database. Take the pooled connection string and rewrite it for
   SQLAlchemy: `postgresql+psycopg://USER:PASSWORD@HOST/DB?sslmode=require`.
2. Get an image onto GHCR. Merging to `main` makes the CI workflow push
   `ghcr.io/karmanyaiyer/shrinkflation-detector:latest` and `:sha-<7 hex>`.
3. Make the package public so Container Apps can pull it without credentials: GitHub profile,
   Packages, `shrinkflation-detector`, Package settings, Change visibility, Public. Until this is
   done the container app will fail to pull the image.
4. Install the Azure CLI, then `az login` and `az account set --subscription <id>`.
5. Export the configuration and run the deploy script. Do not source `.env`; it holds the local
   `DATABASE_URL` and OTLP endpoint. The script refuses localhost values.

   ```bash
   export DATABASE_URL='postgresql+psycopg://...'
   export DEEPSEEK_API_KEY='...'
   export KROGER_CLIENT_ID='...'
   export KROGER_CLIENT_SECRET='...'
   export KROGER_LOCATION_ID='<8 digit locationId>'
   export KROGER_LOCATION_LABEL='one Kroger store'
   export VISITOR_HASH_SALT="$(openssl rand -hex 32)"
   export CORS_ORIGINS='["https://karmanyaiyer.com"]'
   # optional: RESOURCE_GROUP, LOCATION, NAME_PREFIX, IMAGE_TAG, REFRESH_CRON
   ./infra/deploy.sh
   ```

   `WHAT_IF=1 ./infra/deploy.sh` previews changes without applying them. The first run takes
   a few minutes because the environment is created.
6. Apply migrations and wait for the execution to succeed:

   ```bash
   az containerapp job start --name shrink-migrate --resource-group shrinkflation-rg
   az containerapp job execution list --name shrink-migrate --resource-group shrinkflation-rg --output table
   ```
7. Build the basket once. This reuses the refresh job's image, secrets, and environment with a
   different command (`--target` defaults to 1200; pass `--args="--target=1500"` to change it):

   ```bash
   az containerapp job start --name shrink-refresh --resource-group shrinkflation-rg --command shrink build-basket
   ```
8. Run the first refresh by hand or wait for the schedule:

   ```bash
   az containerapp job start --name shrink-refresh --resource-group shrinkflation-rg
   ```
9. Check `https://<fqdn>/api/health` (the script prints the FQDN) and point the frontend build at
   that URL.
10. Configure GitHub for automatic deploys (next section).

## GitHub Actions deploys

`.github/workflows/deploy.yml` runs after CI succeeds on `main`, or by hand with an
`image_tag` input (use an earlier `sha-<7 hex>` tag to roll back). It uses the `production`
environment, so add required reviewers under Settings, Environments, production if approvals
are wanted. Each deploy updates the migrate job image, runs it and waits, then updates the API
and the refresh job, then checks `/api/health`.

### Azure identity for the workflow (OIDC, no stored credentials)

```bash
RG=shrinkflation-rg
SUB=$(az account show --query id --output tsv)
TENANT=$(az account show --query tenantId --output tsv)

APP_ID=$(az ad app create --display-name shrinkflation-github-deploy --query appId --output tsv)
az ad sp create --id "$APP_ID" --output none
SP_ID=$(az ad sp show --id "$APP_ID" --query id --output tsv)

az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
  --role Contributor --scope "/subscriptions/$SUB/resourceGroups/$RG" --output none

az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-production",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:KarmanyaIyer/shrinkflation-detector:environment:production",
  "audiences": ["api://AzureADTokenExchange"]
}'

echo "AZURE_CLIENT_ID=$APP_ID AZURE_TENANT_ID=$TENANT AZURE_SUBSCRIPTION_ID=$SUB"
```

The subject only matches jobs that use the `production` environment, which is why the
workflow declares it.

### Secrets and variables

Repository or `production` environment scope, both work.

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `AZURE_CLIENT_ID` | `appId` printed above |
| Secret | `AZURE_TENANT_ID` | tenant id printed above |
| Secret | `AZURE_SUBSCRIPTION_ID` | subscription id printed above |
| Variable | `AZURE_RESOURCE_GROUP` | `shrinkflation-rg` |
| Variable | `ACA_API_NAME` | `shrink-api` |
| Variable | `ACA_JOB_NAME` | `shrink-refresh` |
| Variable | `ACA_MIGRATE_JOB_NAME` | `shrink-migrate` |

With the GitHub CLI:

```bash
gh secret set AZURE_CLIENT_ID --body "$APP_ID"
gh secret set AZURE_TENANT_ID --body "$TENANT"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUB"
gh variable set AZURE_RESOURCE_GROUP --body shrinkflation-rg
gh variable set ACA_API_NAME --body shrink-api
gh variable set ACA_JOB_NAME --body shrink-refresh
gh variable set ACA_MIGRATE_JOB_NAME --body shrink-migrate
```

`GITHUB_TOKEN` is used by CI to push to GHCR; no extra secret is needed for that.

## Operations

Run the refresh job now:

```bash
az containerapp job start --name shrink-refresh --resource-group shrinkflation-rg
az containerapp job execution list --name shrink-refresh --resource-group shrinkflation-rg --output table
az containerapp job logs show --name shrink-refresh --resource-group shrinkflation-rg --container refresh --execution <execution name>
```

`az containerapp job logs show` is a preview command from the `containerapp` CLI extension, which
installs itself on first use. The Log Analytics query below works without it.

API logs:

```bash
az containerapp logs show --name shrink-api --resource-group shrinkflation-rg --follow
```

Query in Log Analytics:

```kusto
ContainerAppConsoleLogs_CL
| where ContainerJobName_s == "shrink-refresh" or ContainerAppName_s == "shrink-api"
| project TimeGenerated, ContainerName_s, Log_s
| order by TimeGenerated desc
```

Change the schedule without a full redeploy:

```bash
az containerapp job update --name shrink-refresh --resource-group shrinkflation-rg --cron-expression "0 12 * * *"
```

Redeploying with `deploy.sh` resets any change made by hand to values from the template.

## Tracing

The app exports traces with the OTLP/HTTP exporter to `OTEL_EXPORTER_OTLP_ENDPOINT`
(`backend/src/shrinkflation/observability.py`). The template leaves that variable unset in
production, so spans are created for log correlation but not exported. Two ways to export:

- Any OTLP/HTTP collector (Grafana Cloud, Honeycomb, New Relic, Langfuse, a self hosted
  collector): set `OTEL_EXPORTER_OTLP_ENDPOINT` to the base URL (the app appends `/v1/traces`)
  and, if the vendor needs auth headers, `OTEL_EXPORTER_OTLP_HEADERS` to `name=value` pairs
  separated by commas. Both are read by the OpenTelemetry SDK. Then rerun `deploy.sh`.
- Application Insights through the Container Apps managed OpenTelemetry agent. The agent only
  accepts gRPC (it injects `OTEL_EXPORTER_OTLP_PROTOCOL=grpc`), and the agent settings
  (`openTelemetryConfiguration`) exist only in preview API versions of
  `Microsoft.App/managedEnvironments`, so this template does not enable it. To use it: add
  `opentelemetry-exporter-otlp-proto-grpc` to the backend and switch `observability.py` to the
  gRPC exporter, then enable the agent on the environment with

  ```bash
  CS=$(az resource show --resource-group shrinkflation-rg --name shrink-insights \
    --resource-type Microsoft.Insights/components --query properties.ConnectionString --output tsv)
  az containerapp env telemetry app-insights set --resource-group shrinkflation-rg --name shrink-env \
    --connection-string "$CS" --enable-open-telemetry-traces true --enable-open-telemetry-logs true
  ```

  and leave `OTEL_EXPORTER_OTLP_ENDPOINT` unset so the value injected by the platform is used.
  The agent itself has no compute charge; ingested data is billed as Log Analytics.

## Files

- `main.bicep`: all resources, resource group scope.
- `main.bicepparam`: parameter file that reads secrets from environment variables.
- `deploy.sh`: checks the CLI login, creates the resource group, deploys, prints the FQDN.
