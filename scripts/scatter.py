from pathlib import Path

import pandas as pd
import clusterfun as clt


def main():
    df = pd.DataFrame()
    df["x"] = [1, 2, 3]
    df["y"] = [1, 2, 3]
    df["media"] = [file for file in (Path(__file__).parent.parent / "data" / "wikiart").rglob("*/*.jpg")][:3]
    df["color"] = ["red", "blue", "green"]
    clt.scatter(
        df,
        x="x",
        y="y",
        media="media",
        color="color",
        title="A title of a plot",
    )


if __name__ == "__main__":
    main()
