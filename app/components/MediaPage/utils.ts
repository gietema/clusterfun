import { Media } from "@/app/plots/models/Media";


export const getNextMedia = (mediaList: Media[], currentIndex: number): Media | null => {
  const currentMediaIndex = mediaList.findIndex((media) => media.index === currentIndex);
  return currentMediaIndex === -1 || currentMediaIndex >= mediaList.length - 1 ? null : mediaList[currentMediaIndex + 1];
};

export const getPreviousMedia = (mediaList: Media[], currentIndex: number): Media | null => {
  const currentMediaIndex = mediaList.findIndex((media) => media.index === currentIndex);
  return currentMediaIndex <= 0 ? null : mediaList[currentMediaIndex - 1];
};

export const rotateImage = (base64Image: string, degrees: number, callback: (src: string, width: number, height: number) => void): void => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const image = new Image();

  image.onload = () => {
    if (degrees % 180 === 0) {
      canvas.width = image.width;
      canvas.height = image.height;
    } else {
      canvas.width = image.height;
      canvas.height = image.width;
    }

    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();

    callback(canvas.toDataURL(), canvas.width, canvas.height);
  };

  image.src = base64Image;
};
