import pandas as pd

import clusterfun as clt


def main():
    df = pd.read_csv("https://raw.githubusercontent.com/gietema/clusterfun-data/main/wiki-art.csv")
    print(clt.pie_chart(df, color="painter", media="img_path", show=False))


if __name__ == "__main__":
    main()
