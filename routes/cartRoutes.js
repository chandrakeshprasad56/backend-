const express = require("express");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const auth = require("../middleware/authMiddleware");

const router = express.Router();

/* ===========================
   Add to Cart
=========================== */
router.post("/add", auth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = Math.max(1, Number(quantity || 1));

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = new Cart({
        user: req.user._id,
        items: []
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.stock <= 0) {
      return res.status(400).json({ message: "Product out of stock" });
    }

    const productIndex = cart.items.findIndex(
      item => item.product.toString() === productId
    );

    if (productIndex > -1) {
      const nextQty = cart.items[productIndex].quantity + qty;
      if (nextQty > product.stock) {
        return res.status(400).json({ message: "Quantity exceeds stock" });
      }
      cart.items[productIndex].quantity = nextQty;
    } else {
      if (qty > product.stock) {
        return res.status(400).json({ message: "Quantity exceeds stock" });
      }
      cart.items.push({ product: productId, quantity: qty });
    }

    product.cartAdds += qty;
    await product.save();

    await cart.save();

    res.json({ message: "Product added to cart", cart });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* ===========================
   Get My Cart
=========================== */
router.get("/", auth, async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id })
    .populate("items.product");

  if (!cart) return res.json({ items: [] });

  // Auto-remove out-of-stock items
  const filtered = cart.items.filter(i => (i.product?.stock ?? 0) > 0);
  if (filtered.length !== cart.items.length) {
    cart.items = filtered;
    await cart.save();
  }

  const lowStock = cart.items
    .filter(i => (i.product?.stock ?? 0) <= 3)
    .map(i => ({
      productId: i.product?._id,
      name: i.product?.name,
      stock: i.product?.stock
    }));

  res.json({ cart, lowStock });
});

/* ===========================
   Remove Item
=========================== */
router.delete("/remove/:productId", auth, async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });

  cart.items = cart.items.filter(
    item => item.product.toString() !== req.params.productId
  );

  await cart.save();

  const product = await Product.findById(req.params.productId);
  if (product) {
    product.cartRemoves += 1;
    await product.save();
  }

  res.json({ message: "Item removed" });
});

/* ===========================
   Update Quantity
=========================== */
router.put("/update", auth, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    const qty = Math.max(1, Number(quantity || 1));
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (qty > product.stock) {
      return res.status(400).json({ message: "Quantity exceeds stock" });
    }

    const item = cart.items.find(i => i.product.toString() === productId);
    if (!item) return res.status(404).json({ message: "Item not found" });

    item.quantity = qty;
    await cart.save();
    res.json({ message: "Quantity updated", cart });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
