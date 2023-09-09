export class Media {
  index: number
  src: string
  information?: any[]
  width?: number
  height?: number

  constructor (
    index: number,
    src: string,
    information?: any[],
    height?: number,
    width?: number
  ) {
    this.index = index
    this.src = src
    this.information = information
    this.height = height
    this.width = width
  }
}
