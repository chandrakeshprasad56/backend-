const express = require("express");
const Wishlist = require("../models/Wishlist");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* Add to Wishlist */
router.post("/add/:productId", auth, async (req, res) => {
  let wishlist = await Wishlist.findOne({ user: req.user._id });

  if (!wishlist) {
    wishlist = new Wishlist({
      user: req.user._id,
      products: []
    });
  }

  if (!wishlist.products.includes(req.params.productId)) {
    wishlist.products.push(req.params.productId);
  }

  await wishlist.save();

  res.json({ message: "Added to wishlist" });
});

/* Get Wishlist */
router.get("/", auth, async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id })
    .populate("products");

  res.json(wishlist);
});

/* Remove from Wishlist */
router.delete("/remove/:productId", auth, async (req, res) => {
  const wishlist = await Wishlist.findOne({ user: req.user._id });

  wishlist.products = wishlist.products.filter(
    p => p.toString() !== req.params.productId
  );

  await wishlist.save();

  res.json({ message: "Removed from wishlist" });
});

module.exports = router;
