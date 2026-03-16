"""Browse the CharXiv chart understanding dataset in clusterfun.

CharXiv contains 2,323 charts from arXiv papers, each paired with 4 descriptive
questions and 1 reasoning question for evaluating vision-language models.

Usage:
    python scripts/charxiv.py
    python scripts/charxiv.py --split test
    python scripts/charxiv.py --split validation --max-rows 200
    python scripts/charxiv.py --split validation -e google/siglip2-base-patch16-384
"""

import click

import clusterfun as clt


@click.command()
@click.option("--split", default="validation", help="Dataset split (validation or test)")
@click.option("--max-rows", "-n", default=None, type=int, help="Limit number of chart images")
@click.option(
    "--embeddings-model",
    "-e",
    default=None,
    help="HF model for image embeddings (e.g. google/siglip2-base-patch16-384)",
)
@click.option("--project", "-p", default=None, help="Project name to group views")
def main(split, max_rows, embeddings_model, project):
    clt.from_huggingface(
        "princeton-nlp/CharXiv",
        split=split,
        max_rows=max_rows,
        title=f"CharXiv ({split})",
        embeddings_model=embeddings_model,
        project=project,
    )


if __name__ == "__main__":
    main()
