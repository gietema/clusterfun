export class BoundingBox {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
  color?: string
  label?: string

  constructor (
    xmin: number,
    ymin: number,
    xmax: number,
    ymax: number,
    color?: string,
    label?: string
  ) {
    this.xmin = xmin
    this.ymin = ymin
    this.xmax = xmax
    this.ymax = ymax
    this.color = color
    this.label = label
  }

  width (): number {
    return this.xmax - this.xmin
  }

  height (): number {
    return this.ymax - this.ymin
  }
}
