import pandas as pd

import clusterfun as clt


def main():
    df = pd.read_parquet(
        "https://raw.githubusercontent.com/gietema/clusterfun-data/main/libri_speech_test_clean.parquet"
    )
    print(
        clt.grid(
            df,
            title="LibriSpeech test-clean",
            media="filepath",
            show=False,
            display="translation",
        )
    )


if __name__ == "__main__":
    main()
