

import numpy as np
import pandas as pd

import clusterfun as clt


def test_bounding_box():
    df = pd.DataFrame()
    df["a"] = [1, 2, 3]
    df["image"] = [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
    ]
    
    df["bbox_1"] = [{
        "xmin": np.random.randint(0, 100),
        "ymin": np.random.randint(0, 100),
        "xmax": np.random.randint(0, 100),
        "ymax": np.random.randint(0, 100),
        "color": None,
        "label": ["bbox_1"]
    } for _ in range(len(df))]


    print(
        clt.grid(
            df, media="image", bounding_box="bbox_1", title="test bounding box", show=False
        )
    )
