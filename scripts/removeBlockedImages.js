const path = require("path");
const dotenv = require("dotenv");
const connectDB = require("../config/db");
const Product = require("../models/Product");
const Shop = require("../models/Shop");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const blockedPatterns = [
  "images.pexels.com/photos/6192127",
  "pexels-photo-6192127",
  "images.pexels.com/photos/34939748",
  "pexels-photo-34939748",
];

const safeElectronicsImage =
  "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg";

const categoryFallbackImage = {
  Medicine:
    "https://images.pexels.com/photos/593451/pexels-photo-593451.jpeg?cs=srgb&dl=pexels-pixabay-593451.jpg&fm=jpg",
  Grocery:
    "https://images.pexels.com/photos/264636/pexels-photo-264636.jpeg?cs=srgb&dl=pexels-pixabay-264636.jpg&fm=jpg",
  Electronics: safeElectronicsImage,
  Fashion:
    "https://images.pexels.com/photos/934070/pexels-photo-934070.jpeg?cs=srgb&dl=pexels-godisable-jacob-934070.jpg&fm=jpg",
  Beauty:
    "https://images.pexels.com/photos/2113855/pexels-photo-2113855.jpeg?cs=srgb&dl=pexels-suzy-hazelwood-2113855.jpg&fm=jpg",
  Hardware:
    "https://images.pexels.com/photos/209235/pexels-photo-209235.jpeg?cs=srgb&dl=pexels-pixabay-209235.jpg&fm=jpg",
  Stationery:
    "https://images.pexels.com/photos/159731/pen-notebook-student-school-159731.jpeg?cs=srgb&dl=pexels-pixabay-159731.jpg&fm=jpg",
  "Home Essentials":
    "https://images.pexels.com/photos/1352191/pexels-photo-1352191.jpeg?cs=srgb&dl=pexels-dariashevtsova-1352191.jpg&fm=jpg",
};

const hasBlockedUrl = (value = "") =>
  blockedPatterns.some((pattern) => String(value).includes(pattern));

async function main() {
  try {
    await connectDB();

    const productDocs = await Product.find({
      image: { $type: "string", $ne: "" },
    }).select("_id image");
    const badProducts = productDocs.filter((p) => hasBlockedUrl(p.image));

    const shopDocs = await Shop.find({
      logo: { $type: "string", $ne: "" },
    }).select("_id logo");
    const badShops = shopDocs.filter((s) => hasBlockedUrl(s.logo));

    if (badProducts.length) {
      await Product.updateMany(
        { _id: { $in: badProducts.map((p) => p._id) } },
        { $set: { image: safeElectronicsImage } }
      );
    }

    if (badShops.length) {
      await Shop.updateMany(
        { _id: { $in: badShops.map((s) => s._id) } },
        { $set: { logo: safeElectronicsImage } }
      );
    }

    // Force-fix known problematic listing seen in production.
    const fixedPortableSsd = await Product.updateMany(
      { name: "Portable SSD 1TB" },
      { $set: { image: safeElectronicsImage } }
    );

    // Convert non-hosted local filenames (e.g. "1732.jpg") to stable cloud URLs.
    const productsWithLocalImages = await Product.find({
      $or: [{ image: { $exists: false } }, { image: "" }, { image: { $not: /^https?:\/\//i } }],
    }).select("_id category");

    if (productsWithLocalImages.length) {
      const ops = productsWithLocalImages.map((product) => ({
        updateOne: {
          filter: { _id: product._id },
          update: {
            $set: {
              image:
                categoryFallbackImage[product.category] ||
                categoryFallbackImage["Home Essentials"],
            },
          },
        },
      }));
      await Product.bulkWrite(ops);
    }

    const shopsWithLocalLogos = await Shop.find({
      $or: [{ logo: { $exists: false } }, { logo: "" }, { logo: { $not: /^https?:\/\//i } }],
    }).select("_id categories");

    if (shopsWithLocalLogos.length) {
      const ops = shopsWithLocalLogos.map((shop) => {
        const firstCategory = Array.isArray(shop.categories) && shop.categories.length
          ? shop.categories[0]
          : "Home Essentials";
        return {
          updateOne: {
            filter: { _id: shop._id },
            update: {
              $set: {
                logo:
                  categoryFallbackImage[firstCategory] ||
                  categoryFallbackImage["Home Essentials"],
              },
            },
          },
        };
      });
      await Shop.bulkWrite(ops);
    }

    console.log(
      `Removed blocked image URLs from ${badProducts.length} products and ${badShops.length} shops. Updated Portable SSD entries: ${fixedPortableSsd.modifiedCount}. Normalized local product images: ${productsWithLocalImages.length}. Normalized local shop logos: ${shopsWithLocalLogos.length}.`
    );
    process.exit(0);
  } catch (error) {
    console.error("Failed to clean images:", error.message);
    process.exit(1);
  }
}

main();
