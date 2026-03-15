import click

import clusterfun as clt
from datasets import dataset_option, load_dataset


@click.command()
@dataset_option
@click.option("--max-groups", default=6, help="Max number of groups to show.")
def main(dataset, max_groups):
    df, ds = load_dataset(dataset)
    # Limit to top N groups by frequency to keep the plot readable
    top = df[ds.color].value_counts().nlargest(max_groups).index
    df = df[df[ds.color].isin(top)]
    print(clt.violin(df, y=ds.numeric, media=ds.media, color=ds.color, show=False))


if __name__ == "__main__":
    main()
