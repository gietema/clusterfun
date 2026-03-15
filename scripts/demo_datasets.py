"""Dataset definitions for example scripts."""

from dataclasses import dataclass

import click
import pandas as pd

BASE_URL = "https://raw.githubusercontent.com/gietema/clusterfun-data/main"


@dataclass
class Dataset:
    name: str
    url: str
    media: str
    color: str  # primary categorical (scatter color, pie, violin groups)
    color2: str  # secondary categorical (bar_chart color breakdown)
    numeric: str  # numeric column (histogram x, violin y)
    x: str = "x"
    y: str = "y"


DATASETS = {
    "wiki-art": Dataset(
        name="Wiki-Art",
        url=f"{BASE_URL}/wiki-art.csv",
        media="img_path",
        color="painter",
        color2="style",
        numeric="brightness",
    ),
    "mnist": Dataset(
        name="MNIST",
        url=f"{BASE_URL}/mnist.csv",
        media="img_path",
        color="label",
        color2="pred",
        numeric="mean_value",
    ),
    "cifar10": Dataset(
        name="CIFAR-10",
        url=f"{BASE_URL}/cifar10.csv",
        media="img_path",
        color="label",
        color2="pred",
        numeric="score",
    ),
}

dataset_option = click.option(
    "--dataset",
    type=click.Choice(list(DATASETS.keys())),
    default="wiki-art",
    help="Dataset to use.",
)


def load_dataset(name: str) -> tuple[pd.DataFrame, Dataset]:
    ds = DATASETS[name]
    df = pd.read_csv(ds.url)
    print(f"Loaded {len(df)} items from {ds.name}")
    return df, ds
