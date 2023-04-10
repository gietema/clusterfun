export interface Dimension {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

export interface HeightWidth {
  height: number
  width: number
}

export function getContainedSize (img: HTMLImageElement): HeightWidth {
  const ratio = img.naturalWidth / img.naturalHeight
  let width = img.height * ratio
  let height = img.height
  if (width > img.width) {
    width = img.width
    height = img.width / ratio
  }
  return { width, height }
}
