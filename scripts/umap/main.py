import os
import hydra
from omegaconf import DictConfig, OmegaConf
import numpy as np
import pandas as pd
from pathlib import Path
import torch
from torchvision import transforms
from PIL import Image
from tqdm.notebook import tqdm
import umap
from timm import create_model


def download_and_extract(url, dest_path):
    os.system(f"wget {url} -O {dest_path}")
    os.system(f"tar -xvf {dest_path}")


def reduce_dim(features: torch.Tensor) -> torch.Tensor:
    if len(features.shape) == 4:
        return features.mean(dim=(1, 2))
    return features


def get_df(ds_path) -> pd.DataFrame:
    dfs = []
    for ds_type_dir in sorted(Path(ds_path).iterdir()):
        for class_dir in ds_type_dir.iterdir():
            df = pd.DataFrame()
            img_paths = [i for i in class_dir.iterdir()]
            df["img_path"] = img_paths
            df["label"] = class_dir.stem
            df["ds_type"] = ds_type_dir.stem
            dfs.append(df)
    df = pd.concat(dfs)
    return df


def save_features(model, df: pd.DataFrame, output_path: Path, input_size):
    preprocess = transforms.Compose([
        transforms.Resize(input_size),
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.48145466, 0.4578275, 0.40821073), std=(0.26862954, 0.26130258, 0.27577711)),
    ])

    for layer_name, layer in model.named_children():
        if layer_name.startswith("heads"):
            continue
        for i in tqdm(range(0, len(df) // 10000)):
            x_train = [preprocess(Image.open(img_path)) for img_path in
                       tqdm(df.img_path.tolist()[i * 5000:(i + 1) * 5000])]
            x_train = torch.stack(x_train)
            (output_path / layer_name).mkdir(parents=True, exist_ok=True)
            intermediate_layer_model = torch.nn.Sequential(*list(model.children())[:i + 1])
            with torch.no_grad():
                intermediate_output = reduce_dim(intermediate_layer_model(x_train))
            output_path.mkdir(parents=True, exist_ok=True)
            np.save(output_path / layer_name / f"{i}.npy", intermediate_output.numpy())


def load_features(output_path: Path):
    return np.concatenate([np.load(f) for f in sorted(output_path.iterdir(), key=os.path.getmtime) if not f.is_dir()])


def create_umap_embeddings(model, output_path: Path):
    for layer_name, layer in model.named_children():
        if (output_path / layer_name / "umap" / "embedding.npy").exists():
            print(layer_name, "done already")
            continue
        if not (output_path / layer_name).exists():
            print(layer_name, "not existing")
            continue
        print(layer_name)
        reducer = umap.UMAP()
        embedding = reducer.fit_transform(load_features(output_path / layer_name))
        (output_path / layer_name / "umap").mkdir(parents=True, exist_ok=True)
        np.save(output_path / layer_name / "umap" / "embedding.npy", embedding)


def get_preds(df, model, input_size):
    preprocess = transforms.Compose([
        transforms.Resize(input_size),
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.48145466, 0.4578275, 0.40821073), std=(0.26862954, 0.26130258, 0.27577711)),
    ])

    preds = None
    for i in tqdm(range(0, 7)):
        imgs = [preprocess(Image.open(f)) for f in df.img_path[i * 10000:(i + 1) * 10000]]
        imgs = torch.stack(imgs)
        with torch.no_grad():
            pred_batch = model(imgs)
        preds = pred_batch if preds is None else torch.cat([preds, pred_batch])
    return preds


@hydra.main(config_path="conf", config_name="config")
def main(cfg: DictConfig):
    print(OmegaConf.to_yaml(cfg))

    dataset_cfg = cfg.dataset
    model_cfg = cfg.model
    paths_cfg = cfg.paths

    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    if not Path(dataset_cfg.data_dir).exists():
        download_and_extract(dataset_cfg.url, f"{dataset_cfg.data_dir}.tgz")

    df = get_df(dataset_cfg.data_dir)
    model = create_model(model_cfg.name, pretrained=model_cfg.pretrained).to(device)
    model.eval()

    output_path = Path(paths_cfg.output_dir)
    save_features(model, df, output_path, model_cfg.input_size, device)
    create_umap_embeddings(model, output_path)
    preds = get_preds(df, model, model_cfg.input_size, device)
    np.save(output_path / "predictions.npy", preds.cpu().numpy())


if __name__ == "__main__":
    main()
