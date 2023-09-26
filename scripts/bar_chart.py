from pathlib import Path

import pandas as pd

import clusterfun as clt


def main():
    # create a pie chart plot with clusterfun. Generate the data first with numpy and then use clusterfun to create the plot.
    # create a dataframe with the data
    df = pd.read_parquet(Path(__file__).parent.parent / "tests" / "samples" / "wiki_red.parquet")
    # df.img_path = df.img_path.apply(lambda x: f"/Users/jochemgietema/code/clusterfun{x}")
    df.img_path = df.img_path.apply(lambda x: x.replace("/Users/jochemgietema/code/clusterfun/data", "s3://clusterfun-test-bucket/imgs"))
    # df['img_path'] = df.img_path.apply(lambda x: f"/Users/jochemgietema/code/clusterfun{x}")

    dff = df[[c for c in df.columns if c not in ["emb"]]]
    x = clt.bar_chart(dff, x="painter", media="img_path", show=False, color="style")
    print(x)


if __name__ == '__main__':
    main()
