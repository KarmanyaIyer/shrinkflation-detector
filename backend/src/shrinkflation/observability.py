"""OpenTelemetry setup. Traces go to any OTLP/HTTP endpoint (Jaeger locally, Azure Monitor or
Langfuse in production). With no endpoint configured, spans are still created but not exported,
so trace ids remain available for log correlation.
"""

import logging

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, SERVICE_VERSION, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from shrinkflation import __version__
from shrinkflation.config import get_settings

log = logging.getLogger(__name__)
_configured = False


def setup_tracing() -> None:
    global _configured
    if _configured:
        return
    settings = get_settings()
    resource = Resource.create(
        {
            SERVICE_NAME: settings.otel_service_name,
            SERVICE_VERSION: __version__,
            "deployment.environment": settings.environment,
        }
    )
    provider = TracerProvider(resource=resource)
    endpoint = settings.otel_exporter_otlp_endpoint.rstrip("/")
    if endpoint:
        traces_url = endpoint if endpoint.endswith("/v1/traces") else f"{endpoint}/v1/traces"
        provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=traces_url)))
        log.info("tracing export enabled: %s", traces_url)
    trace.set_tracer_provider(provider)
    HTTPXClientInstrumentor().instrument()
    _configured = True


def get_tracer() -> trace.Tracer:
    return trace.get_tracer("shrinkflation", __version__)


def current_trace_ids() -> tuple[str | None, str | None]:
    """Hex trace id and span id of the active span, for storing next to database rows."""
    span = trace.get_current_span()
    context = span.get_span_context()
    if not context.is_valid:
        return None, None
    return format(context.trace_id, "032x"), format(context.span_id, "016x")


def shutdown_tracing() -> None:
    provider = trace.get_tracer_provider()
    if isinstance(provider, TracerProvider):
        provider.shutdown()
