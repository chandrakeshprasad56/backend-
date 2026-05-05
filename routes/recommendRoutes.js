const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Shop = require("../models/Shop");
const User = require("../models/User");

const router = express.Router();

const getUserFromToken = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    return user || null;
  } catch (e) {
    return null;
  }
};

router.get("/home", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    const { lat, lng, maxDistanceKm } = req.query;

    let recommended = [];
    let trending = [];
    let nearby = [];

    // Trending products
    trending = await Product.find()
      .sort({ salesCount: -1, averageRating: -1, views: -1 })
      .limit(8)
      .populate("shop");

    // Personalized recommendations based on purchase history
    if (user) {
      const orders = await Order.find({ user: user._id }).populate("products.product");
      const purchasedIds = new Set();
      const categories = new Set();
      orders.forEach((o) => {
        o.products.forEach((p) => {
          if (p.product?._id) purchasedIds.add(String(p.product._id));
          if (p.product?.category) categories.add(p.product.category);
        });
      });

      if (categories.size > 0) {
        recommended = await Product.find({
          category: { $in: Array.from(categories) },
          _id: { $nin: Array.from(purchasedIds) }
        })
          .sort({ averageRating: -1, salesCount: -1 })
          .limit(8)
          .populate("shop");
      }
    }

    // Nearby recommendations
    if (lat && lng) {
      const maxDistance = Number(maxDistanceKm || 10) * 1000;
      const shops = await Shop.find({
        location: {
          $near: {
            $geometry: { type: "Point", coordinates: [Number(lng), Number(lat)] },
            $maxDistance: maxDistance
          }
        }
      }).select("_id");

      if (shops.length) {
        nearby = await Product.find({ shop: { $in: shops.map((s) => s._id) } })
          .sort({ averageRating: -1 })
          .limit(8)
          .populate("shop");
      }
    }

    res.json({ recommended, trending, nearby });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Frequently bought together
router.get("/fbt/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const orders = await Order.find({ "products.product": productId }).populate("products.product");

    const counts = {};
    orders.forEach((o) => {
      o.products.forEach((p) => {
        const id = p.product?._id?.toString();
        if (!id || id === productId) return;
        counts[id] = (counts[id] || 0) + p.quantity;
      });
    });

    const sortedIds = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map((x) => x[0]);

    const items = await Product.find({ _id: { $in: sortedIds } }).populate("shop");
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
