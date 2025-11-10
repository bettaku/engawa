//! ImageProcessingService
//! SPDX-FileCopyright: esurio <esurio@esurio1673.net>
//!

use image::ImageEncoder;

#[derive(Debug, Clone)]
pub struct ProcessedImage {
    pub data: Vec<u8>,
    pub ext: String,
    pub mime_type: String,
}

#[derive(Debug, Clone, Copy)]
pub struct PngOptions {
    pub compression: image::codecs::png::CompressionType,
    pub filter: image::codecs::png::FilterType,
}

impl Default for PngOptions {
    fn default() -> Self {
        Self {
            compression: image::codecs::png::CompressionType::Default,
            filter: image::codecs::png::FilterType::Avg,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ImageProcessingService;

impl ImageProcessingService {
    pub async fn convert_image_to_webp(
        image: image::DynamicImage,
        width: u32,
        height: u32,
    ) -> Result<ProcessedImage, image::ImageError> {
        let img = Self.resize(&image, width, height);

        let mut buffer = Vec::new();
        let encoder = image::codecs::webp::WebPEncoder::new_lossless(&mut buffer);

        encoder.encode(
            img.as_bytes(),
            width,
            height,
            image::ExtendedColorType::from(image.color()),
        )?;

        Ok(ProcessedImage {
            data: buffer,
            ext: "webp".to_string(),
            mime_type: "image/webp".to_string(),
        })
    }

    pub async fn convert_image_to_png(
        image: image::DynamicImage,
        width: u32,
        height: u32,
        options: Option<PngOptions>,
    ) -> Result<ProcessedImage, image::ImageError> {
        let options = options.unwrap_or_default();
        let compression = options.compression;
        let filter = options.filter;
        let img = Self.resize(&image, width, height);

        let mut buffer = Vec::new();
        let encoder =
            image::codecs::png::PngEncoder::new_with_quality(&mut buffer, compression, filter);

        encoder.write_image(
            img.as_bytes(),
            width,
            height,
            image::ExtendedColorType::from(img.color()),
        )?;

        Ok(ProcessedImage {
            data: buffer,
            ext: "png".to_string(),
            mime_type: "image/png".to_string(),
        })
    }

    fn resize(&self, image: &image::DynamicImage, width: u32, height: u32) -> image::DynamicImage {
        image.resize(width, height, image::imageops::FilterType::Lanczos3)
    }
}
