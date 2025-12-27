import sharp from "sharp";
import fs from "fs";

console.log("🔍 Analyzing captcha.png...\n");

// Get image info
const metadata = await sharp("captcha.png").metadata();
console.log("📊 Original Image Info:");
console.log(`   Size: ${metadata.width}x${metadata.height}`);
console.log(`   Format: ${metadata.format}`);
console.log(`   Channels: ${metadata.channels}`);

// Create multiple enhanced versions
const enhancements = [
  { name: "1_original_enlarged", pipeline: sharp("captcha.png").resize(800, 300, { fit: "inside" }) },
  { name: "2_high_contrast", pipeline: sharp("captcha.png").resize(800, 300).normalize().grayscale().linear(3, -384).threshold(120) },
  { name: "3_inverted", pipeline: sharp("captcha.png").resize(800, 300).normalize().grayscale().negate().threshold(140) },
  { name: "4_edge_enhance", pipeline: sharp("captcha.png").resize(800, 300).normalize().grayscale().sharpen({ sigma: 2 }).threshold(130) },
  { name: "5_ultra_sharp", pipeline: sharp("captcha.png").resize(1000, 400).normalize().grayscale().sharpen({ sigma: 3 }).linear(2.5, -320).median(1).threshold(125) },
  { name: "6_adaptive", pipeline: sharp("captcha.png").resize(600, 225).normalize().grayscale().clahe({ width: 3, height: 3 }).threshold(128) }
];

console.log("\n🎨 Creating enhanced versions...\n");

for (const { name, pipeline } of enhancements) {
  const filename = `debug_${name}.png`;
  await pipeline.toFile(filename);
  console.log(`✅ Created: ${filename}`);
}

console.log("\n" + "=".repeat(60));
console.log("💡 NEXT STEPS:");
console.log("=".repeat(60));
console.log("1. Cek semua file debug_*.png");
console.log("2. Lihat mana yang PALING JELAS");
console.log("3. Kalau masih blur, captcha ini memang susah untuk OCR");
console.log("4. Alternatif: Gunakan service lain (Anti-Captcha, CapMonster)");
console.log("\n📸 Upload captcha.png ke: https://i.imgur.com");
console.log("   Lalu share link-nya, saya bisa lihat langsung");
console.log("=".repeat(60));
