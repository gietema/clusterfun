"""Browse a HuggingFace image dataset in clusterfun.

Usage:
    python scripts/huggingface.py
    python scripts/huggingface.py --dataset ethz/food101 --split train
    python scripts/huggingface.py --dataset uoft-cs/cifar10 --split test --max-rows 1000
    python scripts/huggingface.py --search food  # search for datasets
"""

import click

import clusterfun as clt


@click.command()
@click.option("--dataset", default="ethz/food101", help="HuggingFace dataset ID")
@click.option("--split", default="train", help="Dataset split")
@click.option("--config-name", default="default", help="Dataset config name")
@click.option("--max-rows", default=None, type=int, help="Limit number of rows")
@click.option("--search", default=None, help="Search for datasets by name")
def main(dataset, split, config_name, max_rows, search):
    if search:
        results = clt.search_datasets(search)
        print("Matching datasets:")
        for ds_id in results:
            print(f"  {ds_id}")
        return

    clt.from_huggingface(
        dataset,
        split=split,
        config_name=config_name,
        max_rows=max_rows,
    )


if __name__ == "__main__":
    main()
