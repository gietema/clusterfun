import numpy as np
import pandas as pd

import clusterfun as clt


def main():
    df = pd.DataFrame()
    df["a"] = [1, 2, 3]
    df["image"] = [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
    ]
    
    df["bbox_1"] = [[
        {
            "xmin": 0,
            "ymin": 0,
            "xmax": 300,
            "ymax": 300,
            "color": None,
            "label": "bbox_0"
        },
        {
            "xmin": 300,
            "ymin": 300,
            "xmax": 600,
            "ymax": 600,
            "color": None,
            "label": "bbox_1"
        },
        {
            "xmin": 600,
            "ymin": 600,
            "xmax": 900,
            "ymax": 900,
            "color": None,
            "label": "bbox_2"
        },
        {
            "xmin": 900,
            "ymin": 900,
            "xmax": 1199,
            "ymax": 1199,
            "color": None,
            "label": "bbox_3"
        },
        ] for _ in range(len(df))]


    print(clt.grid(
        df, media="image", bounding_box="bbox_1", title="test bounding box", show=False,
    ))


if __name__ == "__main__":
    main()
