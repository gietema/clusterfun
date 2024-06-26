export class Config {
  type: string;
  media: string;
  columns: string[];
  labels: string[];
  title?: string;
  x?: string;
  y?: string;
  color?: string;
  size?: string;
  symbol?: string;
  bounding_box?: string;
  colors?: string[];
  // used for the bar chart
  x_names?: string[];
  display?: string[];
  hline?: number;
  vline?: number;

  constructor(
    type: string,
    media: string,
    columns: string[],
    labels: string[],
    title?: string,
    x?: string,
    y?: string,
    color?: string,
    size?: string,
    symbol?: string,
    bounding_box?: string,
    colors?: string[],
    x_names?: string[],
    display?: string[],
    hline?: number,
    vline?: number
  ) {
    this.type = type;
    this.media = media;
    this.columns = columns;
    this.labels = labels;
    this.title = title;
    this.x = x;
    this.y = y;
    this.color = color;
    this.size = size;
    this.symbol = symbol;
    this.bounding_box = bounding_box;
    this.colors = colors;
    this.x_names = x_names;
    this.display = display;
    this.hline = hline;
    this.vline = vline;
  }
}
