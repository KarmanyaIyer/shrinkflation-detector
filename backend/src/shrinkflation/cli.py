"""Command line entry points for the pipeline. Installed as the `shrink` command."""

import logging

import typer

app = typer.Typer(
    no_args_is_help=True, add_completion=False, help="Shrinkflation Detector pipeline commands."
)


@app.callback()
def main(verbose: bool = typer.Option(False, "--verbose", "-v", help="Debug logging")) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    for noisy in ("httpx", "httpx2", "httpcore", "openai", "urllib3"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


@app.command()
def refresh() -> None:
    """Fetch current size and price for every tracked product and record any changes."""
    from shrinkflation.pipeline.refresh import run_refresh

    run_refresh()


@app.command("build-basket")
def build_basket(target: int = typer.Option(1200, help="Number of products to track")) -> None:
    """Discover products to track by searching the retailer catalog by category."""
    from shrinkflation.pipeline.basket import run_build_basket

    run_build_basket(target=target)


@app.command()
def reparse(
    everything: bool = typer.Option(False, "--all", help="Re-run every cached parse"),
) -> None:
    """Re-run size parsing for cached parses after a parser change."""
    from shrinkflation.sizes.maintenance import run_reparse

    run_reparse(everything=everything)


@app.command()
def status() -> None:
    """Print tracked product counts, recent runs, and model spend."""
    from shrinkflation.db.session import session_scope
    from shrinkflation.pipeline.status import build_status

    with session_scope() as session:
        for line in build_status(session).lines():
            typer.echo(line)


@app.command()
def migrate() -> None:
    """Apply database migrations."""
    from alembic import command
    from alembic.config import Config

    command.upgrade(Config("alembic.ini"), "head")


if __name__ == "__main__":
    app()
