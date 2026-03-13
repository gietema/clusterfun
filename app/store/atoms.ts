import { atom } from "jotai";
import type { PlotConfig, Media, Filter, GridValues, LabelAction, PlotTrace } from "@/app/types";

export const dataAtom = atom<PlotTrace[] | undefined>(undefined);
export const configAtom = atom<PlotConfig | undefined>(undefined);
export const uuidAtom = atom<string>("recent");
export const mediaIndicesStackAtom = atom<Array<number[]>>([]);
export const currentMediaIndicesAtom = atom<number[]>(
  (get) => {
    const stack = get(mediaIndicesStackAtom);
    return stack.length > 0 ? stack[stack.length - 1] : [];
  },
);
export const filtersAtom = atom<Filter[]>([]);
export const gridValuesAtom = atom<GridValues>({
  sortBy: "",
  asc: true,
  page: 0,
  numberOfColumns: 5,
  showColumnValues: [],
  showBboxLabel: false,
});
export const mediaIndexAtom = atom<number | undefined>(undefined);
export const showPageAtom = atom<string>("plot");
export const mediaAtom = atom<Media | undefined>(undefined);
export const mediaItemsAtom = atom<Media[]>([]);
export const labelUndoStackAtom = atom<LabelAction[]>([]);
export const sidebarWidthAtom = atom<number | null>(null);
