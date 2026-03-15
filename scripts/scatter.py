import click

import clusterfun as clt
from datasets import dataset_option, load_dataset


@click.command()
@dataset_option
def main(dataset):
    df, ds = load_dataset(dataset)
    print(clt.scatter(df, x=ds.x, y=ds.y, media=ds.media, color=ds.color, show=False))


if __name__ == "__main__":
    main()
