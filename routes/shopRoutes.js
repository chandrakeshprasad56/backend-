
const express = require("express");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const ShopSuggestion = require("../models/ShopSuggestion");
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

const toPublicShop = (shopDoc) => {
  const shop = shopDoc.toObject ? shopDoc.toObject() : shopDoc;
  const visibleReviews = (shop.reviews || []).filter(isPublicReview);
  const primaryCategory =
    Array.isArray(shop.categories) && shop.categories.length
      ? shop.categories[0]
      : "Home Essentials";
  return {
    ...shop,
    logo: normalizePublicImage(shop.logo, primaryCategory),
    reviews: visibleReviews,
    reviewsCount: visibleReviews.length,
    rating: calculateAverageRating(shop.reviews || [])
  };
};

// Seller creates shop
router.post("/", auth, role("seller"), async (req, res) => {
  try {
    const existingShop = await Shop.findOne({ owner: req.user._id });

    if (existingShop) {
      return res.status(400).json({ message: "Shop already exists" });
    }

    const {
      shopName,
      description,
      logo,
      address,
      city,
      categories,
      lat,
      lng,
      phone,
      openingHours,
      isVerified,
      hasOffers
    } = req.body;

    const location = (lat && lng)
      ? { type: "Point", coordinates: [Number(lng), Number(lat)] }
      : undefined;

    const shop = await Shop.create({
      shopName,
      description,
      logo,
      phone,
      address,
      city,
      openingHours,
      isVerified: Boolean(isVerified),
      hasOffers: Boolean(hasOffers),
      categories: Array.isArray(categories) ? categories : (categories ? [categories] : []),
      location,
      owner: req.user._id
    });

    res.status(201).json(shop);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Community: suggest a shop (public)
router.post("/suggest", async (req, res) => {
  try {
    const { shopName, address, city, phone, categories, openingHours, images, notes } = req.body;
    const suggestion = await ShopSuggestion.create({
      shopName,
      address,
      city,
      phone,
      categories: Array.isArray(categories) ? categories : (categories ? [categories] : []),
      openingHours,
      images: Array.isArray(images) ? images : (images ? [images] : []),
      notes
    });
    res.status(201).json({ message: "Suggestion received", suggestion });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Public: get shops (supports filters and nearby search)
router.get("/", async (req, res) => {
  try {
    const {
      q,
      category,
      city,
      lat,
      lng,
      maxDistanceKm,
      limit,
      minRating,
      verifiedOnly,
      hasOffers,
      openNow,
      sort,
      minPrice,
      maxPrice
    } = req.query;

    const filter = {};
    if (q) {
      filter.shopName = { $regex: q, $options: "i" };
    }
    if (category) {
      filter.categories = { $in: [category] };
    }
    if (city) {
      filter.city = { $regex: city, $options: "i" };
    }
    if (minRating) {
      filter.rating = { $gte: Number(minRating) };
    }
    if (verifiedOnly === "true") {
      filter.isVerified = true;
    }
    if (hasOffers === "true") {
      filter.hasOffers = true;
    }

    let shopIdsByPrice = null;
    if (minPrice || maxPrice) {
      const priceFilter = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);
      const priceMatch = Object.keys(priceFilter).length ? { price: priceFilter } : {};
      const products = await Product.find(priceMatch).select("shop");
      shopIdsByPrice = [...new Set(products.map((p) => String(p.shop)))];
      filter._id = { $in: shopIdsByPrice };
    }

    let query = Shop.find(filter).populate("owner", "name email");

    if (lat && lng) {
      const maxDistance = Number(maxDistanceKm || 10) * 1000;
      query = Shop.find({
        ...filter,
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
            $maxDistance: maxDistance
          }
        }
      }).populate("owner", "name email");
    }

    let shops = await query.limit(Number(limit) || 100);

    // openNow filter - fallback to 09:00-21:00 if missing
    const isOpenNow = (shop) => {
      const hours = shop.openingHours || "09:00-21:00";
      const parts = hours.split("-").map((p) => p.trim());
      if (parts.length !== 2) return true;
      const [openH, openM] = parts[0].split(":").map(Number);
      const [closeH, closeM] = parts[1].split(":").map(Number);
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const openMin = (openH || 0) * 60 + (openM || 0);
      const closeMin = (closeH || 0) * 60 + (closeM || 0);
      return nowMin >= openMin && nowMin <= closeMin;
    };

    if (openNow === "true") {
      shops = shops.filter((s) => isOpenNow(s));
    }

    if (sort === "highestRated") {
      shops = shops.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    if (sort === "mostReviewed") {
      shops = shops.sort((a, b) => (b.reviews?.length || 0) - (a.reviews?.length || 0));
    }
    if (sort === "newlyAdded") {
      shops = shops.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    if (sort === "trending") {
      shops = shops.sort((a, b) => {
        const scoreA = (a.rating || 0) * 2 + (a.reviews?.length || 0);
        const scoreB = (b.rating || 0) * 2 + (b.reviews?.length || 0);
        return scoreB - scoreA;
      });
    }

    res.json(shops.map(toPublicShop));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Shop details + products
router.get("/:id", async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).populate("owner", "name email");
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    res.json(toPublicShop(shop));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add shop review (anyone)
router.post("/:id/reviews", async (req, res) => {
  try {
    const { name, rating, comment, images, verifiedBuyer } = req.body;
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const moderation = await moderateReview({
      name,
      rating: Number(rating),
      comment,
      verifiedBuyer: Boolean(verifiedBuyer),
      existingComments: (shop.reviews || []).map((r) => r.comment)
    });

    shop.reviews.push({
      name,
      rating: Number(rating),
      comment,
      images: Array.isArray(images) ? images : (images ? [images] : []),
      verifiedBuyer: Boolean(verifiedBuyer),
      moderation
    });

    shop.rating = calculateAverageRating(shop.reviews);

    await shop.save();
    res.json({
      message: moderation.status === "approved"
        ? "Review added"
        : "Review submitted and sent for moderation",
      rating: shop.rating,
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

// Add shop review with image upload
router.post("/:id/reviews/upload", upload.array("images", 5), async (req, res) => {
  try {
    const { name, rating, comment, verifiedBuyer } = req.body;
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const files = (req.files || []).map((f) => `/uploads/${f.filename}`);
    const moderation = await moderateReview({
      name,
      rating: Number(rating),
      comment,
      verifiedBuyer: String(verifiedBuyer) === "true",
      existingComments: (shop.reviews || []).map((r) => r.comment)
    });

    shop.reviews.push({
      name,
      rating: Number(rating),
      comment,
      images: files,
      verifiedBuyer: String(verifiedBuyer) === "true",
      moderation
    });

    shop.rating = calculateAverageRating(shop.reviews);

    await shop.save();
    res.json({
      message: moderation.status === "approved"
        ? "Review added"
        : "Review submitted and sent for moderation",
      rating: shop.rating,
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

// Mark review helpful
router.put("/:id/reviews/:reviewId/helpful", async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });
    const review = shop.reviews.id(req.params.reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });
    review.helpfulCount = (review.helpfulCount || 0) + 1;
    await shop.save();
    res.json({ message: "Helpful marked", helpfulCount: review.helpfulCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
