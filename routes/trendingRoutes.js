const express = require("express");
const Product = require("../models/Product");
const Shop = require("../models/Shop");

const router = express.Router();

// Trending products
router.get("/products", async (req, res) => {
  try {
    const products = await Product.find()
      .sort({ salesCount: -1, averageRating: -1, views: -1 })
      .limit(20)
      .populate("shop");
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Trending shops
router.get("/shops", async (req, res) => {
  try {
    const shops = await Shop.find()
      .sort({ rating: -1 })
      .limit(20);
    res.json(shops);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
