import pandas as pd

import clusterfun as clt


def main():
    df = pd.read_csv("https://raw.githubusercontent.com/gietema/clusterfun-data/main/wiki-art.csv")
    print(clt.scatter(df, x="x", y="y", media="img_path", color="painter", show=False))


if __name__ == "__main__":
    main()
