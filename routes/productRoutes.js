
const express = require("express");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { normalizePublicImage } = require("../utils/imageFallback");
const {
  moderateReview,
  isPublicReview,
  calculateAverageRating
} = require("../services/reviewModerationService");

const router = express.Router();

const toPublicProduct = (productDoc) => {
  const product = productDoc.toObject ? productDoc.toObject() : productDoc;
  return {
    ...product,
    image: normalizePublicImage(product.image, product.category),
    reviews: (product.reviews || []).filter(isPublicReview),
    averageRating: calculateAverageRating(product.reviews || [])
  };
};

// Seller adds product
router.post("/", auth, role("seller"), upload.single("image"), async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.user._id });

    if (!shop) {
      return res.status(400).json({ message: "Create shop first" });
    }

    const product = await Product.create({
      name: req.body.name,
      price: req.body.price,
      category: req.body.category,
      stock: req.body.stock,

      // 🔥 THIS IS THE CORRECT LINE
      image: req.file ? req.file.filename : null,

      shop: shop._id
    });

    res.status(201).json(product);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add Review (anyone)
router.post("/review/:productId", async (req, res) => {
  try {
    const { rating, comment, name, verifiedBuyer } = req.body;

    const product = await Product.findById(req.params.productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const moderation = await moderateReview({
      name,
      rating: Number(rating),
      comment,
      verifiedBuyer: Boolean(verifiedBuyer),
      existingComments: (product.reviews || []).map((r) => r.comment)
    });

    const review = {
      name,
      rating: Number(rating),
      comment,
      verifiedBuyer: Boolean(verifiedBuyer),
      moderation
    };

    product.reviews.push(review);

    product.averageRating = calculateAverageRating(product.reviews);

    await product.save();

    res.json({
      message: moderation.status === "approved"
        ? "Review added successfully"
        : "Review submitted and sent for moderation",
      moderation: {
        status: moderation.status,
        riskScore: moderation.riskScore,
        categories: moderation.categories
      }
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Public: Get all products
router.get("/", async (req, res) => {
  const { category, q, minRating, shop } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (q) filter.name = { $regex: q, $options: "i" };
  if (minRating) filter.averageRating = { $gte: Number(minRating) };
  if (shop) filter.shop = shop;

  const products = await Product.find(filter).populate("shop");
  res.json(products.map(toPublicProduct));
});

// Product details (increment views)
router.get("/:id", async (req, res) => {
  const product = await Product.findById(req.params.id).populate("shop");
  if (!product) return res.status(404).json({ message: "Product not found" });
  product.views += 1;
  await product.save();
  res.json(toPublicProduct(product));
});

// Delete product (seller)
router.delete("/:id", auth, role("seller"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate("shop");
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (!product.shop || product.shop.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not allowed" });
    }
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
