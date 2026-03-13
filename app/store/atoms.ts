import { atom } from "jotai";
import type { PlotConfig, Media, Filter, GridValues, LabelAction, PlotTrace } from "@/app/types";

export const dataAtom = atom<PlotTrace[] | undefined>(undefined);
export const configAtom = atom<PlotConfig | undefined>(undefined);
export const uuidAtom = atom<string>("recent");
export const mediaIndicesAtom = atom<Array<number[]>>([]);
export const filtersAtom = atom<Filter[]>([]);
export const gridValuesAtom = atom<GridValues>({
  sortBy: "",
  asc: true,
  page: 0,
  numberOfColumns: 5,
  showColumnValue: undefined,
  showBboxLabel: false,
});
export const mediaIndexAtom = atom<number | undefined>(undefined);
export const showPageAtom = atom<string>("plot");
export const mediaAtom = atom<Media | undefined>(undefined);
export const mediaItemsAtom = atom<Media[]>([]);
export const labelUndoStackAtom = atom<LabelAction[]>([]);
