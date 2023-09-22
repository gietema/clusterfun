import numpy as np
import pandas as pd

import clusterfun as clt


def main():
    len_df = 1000
    df = pd.DataFrame()
    df["x"] = np.random.normal(0, 1, len_df)
    df["media"] = [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg" for _ in range(len_df)
    ]
    print(clt.histogram(df, x="x", media="media", title="A title of a plot", show=False))


if __name__ == "__main__":
    main()
