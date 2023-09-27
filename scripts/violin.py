import pandas as pd

import clusterfun as clt


def main():
    df = pd.read_csv("https://raw.githubusercontent.com/gietema/clusterfun-data/main/wiki-art.csv")
    df = df[df.painter.isin(["Pablo Picasso", "Juan Gris", "George Braque", "Fernand Leger"])]
    print(clt.violin(df, y="brightness", media="img_path", show=False, color="painter"))


if __name__ == "__main__":
    main()
