import os
from pathlib import Path

import pandas as pd

import clusterfun as clt


def main():
    # download data from https://s3.amazonaws.com/fast-ai-sample/cifar10.tgz
    # and extract to ~/Downloads/cifar10
    images = [str(file) for file in Path(os.path.expanduser("~/Downloads/cifar10/test/airplane")).iterdir()][:3]

    df = pd.DataFrame()
    df["x"] = [1, 2, 3]
    df["y"] = [1, 2, 3]
    df["media"] = images
    df["color"] = ["red", "blue", "green"]
    clt.scatter(
        df,
        x="x",
        y="y",
        media="media",
        color="color",
        title="A title of a plot",
    )

    clt.grid(
        df,
        media="media",
        title="A title of a plot",
    )


if __name__ == '__main__':
    main()
