import "server-only";
import sharp from "sharp";
import { BusinessError } from "@/server/errors";
export const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;
export async function receiptImage(
  bytes: Buffer,
  declaredType: string,
  filename: string,
) {
  const invalid = () =>
    new BusinessError(
      "VALIDATION_ERROR",
      "Upload a readable, single-page PNG or JPEG receipt, at most 2MB and 16 million pixels.",
    );
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES) throw invalid();
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const type = png ? "image/png" : jpeg ? "image/jpeg" : "";
  if (!type || declaredType !== type) throw invalid();
  try {
    const source = sharp(bytes, {
      limitInputPixels: 16_000_000,
      failOn: "warning",
    });
    const metadata = await source.metadata();
    if ((metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height)
      throw invalid();
    // Fully decode and re-encode: retain receipt pixels, remove metadata/trailing
    // payloads, and never persist executable SVG/HTML disguised by an extension.
    const image = source.rotate();
    const content = await (
      png ? image.png({ compressionLevel: 9 }) : image.jpeg({ quality: 95 })
    ).toBuffer();
    if (content.length > MAX_RECEIPT_BYTES) throw invalid();
    const stem =
      filename
        .replace(/\.[^.]*$/, "")
        .replace(/[^A-Za-z0-9 _-]/g, "_")
        .trim()
        .slice(0, 140) || "receipt";
    return {
      content,
      contentType: type,
      filename: stem + (png ? ".png" : ".jpg"),
    };
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    throw invalid();
  }
}
