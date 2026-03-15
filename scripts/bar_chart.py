import click

import clusterfun as clt
from datasets import dataset_option, load_dataset


@click.command()
@dataset_option
def main(dataset):
    df, ds = load_dataset(dataset)
    print(clt.bar_chart(df, x=ds.color, color=ds.color2, media=ds.media, show=False))


if __name__ == "__main__":
    main()
