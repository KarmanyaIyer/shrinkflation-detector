#!/usr/bin/env bash
# Creates or updates the Azure resources in main.bicep. Safe to rerun.
# Reads configuration from environment variables (see README.md). Secrets reach Bicep through
# main.bicepparam's readEnvironmentVariable(), so they are never command arguments.
set -euo pipefail

cd "$(dirname "$0")"

RESOURCE_GROUP="${RESOURCE_GROUP:-shrinkflation-rg}"
LOCATION="${LOCATION:-eastus2}"
NAME_PREFIX="${NAME_PREFIX:-shrink}"
export LOCATION NAME_PREFIX

required=(DATABASE_URL DEEPSEEK_API_KEY KROGER_CLIENT_ID KROGER_CLIENT_SECRET KROGER_LOCATION_ID VISITOR_HASH_SALT)
missing=()
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if (( ${#missing[@]} > 0 )); then
  echo "missing environment variables: ${missing[*]}" >&2
  exit 1
fi

# Guard against deploying values copied from a local .env.
case "$DATABASE_URL" in
  *localhost*|*127.0.0.1*|*@postgres:*)
    echo "DATABASE_URL points at a local database; set it to the production URL" >&2
    exit 1 ;;
esac
if [[ "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" == *localhost* || "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" == *127.0.0.1* ]]; then
  echo "OTEL_EXPORTER_OTLP_ENDPOINT points at localhost; unset it or use a reachable collector" >&2
  exit 1
fi

command -v az >/dev/null 2>&1 || { echo "az is not installed: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2; exit 1; }
if ! az account show --only-show-errors >/dev/null 2>&1; then
  echo "not logged in to Azure; run: az login" >&2
  exit 1
fi
echo "subscription: $(az account show --query name --output tsv)"
echo "resource group: $RESOURCE_GROUP ($LOCATION), name prefix: $NAME_PREFIX, image tag: ${IMAGE_TAG:-latest}"

az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none

if [[ "${WHAT_IF:-0}" == "1" ]]; then
  az deployment group what-if --resource-group "$RESOURCE_GROUP" --parameters main.bicepparam
  exit 0
fi

deployment="shrinkflation-$(date -u +%Y%m%d%H%M%S)"
fqdn=$(az deployment group create \
  --name "$deployment" \
  --resource-group "$RESOURCE_GROUP" \
  --parameters main.bicepparam \
  --query properties.outputs.apiFqdn.value \
  --output tsv)

echo
echo "API: https://$fqdn"
echo "Next steps:"
echo "  az containerapp job start --name $NAME_PREFIX-migrate --resource-group $RESOURCE_GROUP"
echo "  az containerapp job start --name $NAME_PREFIX-refresh --resource-group $RESOURCE_GROUP --command shrink build-basket"
echo "  curl https://$fqdn/api/health"
