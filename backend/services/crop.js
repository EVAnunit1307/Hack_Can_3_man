const sharp = require('sharp');

/**
 * Crop regions from an image buffer using normalized bounding boxes.
 * @param {Buffer} imageBuffer - The original image as a buffer
 * @param {Array<{name: string, x: number, y: number, w: number, h: number}>} boundingBoxes
 *   Each bbox has normalized (0-1) coordinates.
 * @returns {Promise<Array<{name: string, buffer: Buffer, bbox: object}>>}
 */
async function cropBoundingBoxes(imageBuffer, boundingBoxes) {
  const metadata = await sharp(imageBuffer).metadata();
  const imgW = metadata.width;
  const imgH = metadata.height;

  const crops = await Promise.all(
    boundingBoxes.map(async (box) => {
      // Cloudinary LVIS returns pixel coordinates
      const left = Math.max(0, Math.round(box.x));
      const top = Math.max(0, Math.round(box.y));
      const width = Math.min(Math.round(box.w), imgW - left);
      const height = Math.min(Math.round(box.h), imgH - top);

      if (width <= 0 || height <= 0) return null;

      const buffer = await sharp(imageBuffer)
        .extract({ left, top, width, height })
        .png()
        .toBuffer();

      return { name: box.name, buffer, bbox: box };
    })
  );

  return crops.filter(Boolean);
}

module.exports = { cropBoundingBoxes };