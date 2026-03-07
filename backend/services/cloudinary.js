/**
 * Cloudinary – single place for all Cloudinary usage in the project.
 * - upload(): store media, get CDN URL + LVIS bounding boxes.
 * - getThumbnailUrl(publicId, resourceType): 400×400 fill crop for cards/previews.
 * - getVideoPosterUrl(publicId): first-frame image for video thumbnails.
 * - getTransformedUrl(publicId, options, resourceType): custom size/format (e.g. responsive).
 * Use these helpers anywhere you need delivery URLs; upload response also includes thumbnailUrl and posterUrl.
 */
const { isFoodLabel, MIN_CONFIDENCE } = require('./food-filter');
const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function upload(localPath) {
  const result = await cloudinary.uploader.upload(localPath, { 
    resource_type: 'auto', 
    detection: 'lvis' 
  });

  // Extract bounding boxes from LVIS detection
  // Structure: result.info.detection.object_detection.data.lvis.tags = { "label": [{ "bounding-box": [x,y,w,h], confidence, categories }] }
  const tags = result.info?.detection?.object_detection?.data?.lvis?.tags || {};
  const boundingBoxes = [];
  for (const [label, detections] of Object.entries(tags)) {
    if (!isFoodLabel(label)) continue;
    if (Array.isArray(detections)) {
      for (const det of detections) {
        if (det.confidence < MIN_CONFIDENCE) continue;
        const bb = det['bounding-box'];
        boundingBoxes.push({
          name: label,
          confidence: det.confidence,
          categories: det.categories,
          x: bb?.[0],
          y: bb?.[1],
          w: bb?.[2],
          h: bb?.[3],
        });
      }
    }
  }

  const resourceType = result.resource_type || 'image';
  const publicId = result.public_id;
  const thumbnailUrl = getThumbnailUrl(publicId, resourceType);
  const posterUrl = resourceType === 'video' ? getVideoPosterUrl(publicId) : null;

  return {
    url: result.secure_url,
    publicId,
    boundingBoxes,
    thumbnailUrl,
    posterUrl,
  };
}

/**
 * Build a Cloudinary URL for a small fill-cropped image (thumbnails, cards).
 * Use anywhere you need a fast-loading preview.
 */
function getThumbnailUrl(publicId, resourceType = 'image') {
  if (!publicId || !process.env.CLOUDINARY_CLOUD_NAME) return null;
  return cloudinary.url(publicId, {
    type: 'upload',
    resource_type: resourceType,
    transformation: [{ width: 400, height: 400, crop: 'fill', quality: 'auto' }],
  });
}

/**
 * Build a Cloudinary URL for the first frame of a video (poster image).
 */
function getVideoPosterUrl(publicId) {
  if (!publicId || !process.env.CLOUDINARY_CLOUD_NAME) return null;
  return cloudinary.url(publicId, {
    type: 'upload',
    resource_type: 'video',
    format: 'jpg',
    transformation: [{ start_offset: 0 }],
  });
}

/**
 * Build a custom Cloudinary delivery URL with transformations.
 * Options: { width, height, crop, quality, format, ... } or Cloudinary transformation array.
 * Use this in one place when you need a specific size/format (e.g. responsive images).
 */
function getTransformedUrl(publicId, options = {}, resourceType = 'image') {
  if (!publicId || !process.env.CLOUDINARY_CLOUD_NAME) return null;
  const t = options.transformation || (options.width || options.height
    ? [{ width: options.width, height: options.height, crop: options.crop || 'fill', quality: options.quality || 'auto', format: options.format }]
    : undefined);
  return cloudinary.url(publicId, {
    type: 'upload',
    resource_type: options.resource_type || resourceType,
    transformation: t,
  });
}

module.exports = {
  upload,
  getThumbnailUrl,
  getVideoPosterUrl,
  getTransformedUrl,
};