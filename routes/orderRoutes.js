

const express = require("express");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");


const router = express.Router();

// Create Order (User)
router.post("/", auth, async (req, res) => {
  try {
    const { products } = req.body;

    let total = 0;

    for (let item of products) {

      const product = await Product.findById(item.product);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // ✅ B) Prevent order if stock is low
      if (product.stock < item.quantity) {
        return res.status(400).json({
          message: `Not enough stock for ${product.name}`
        });
      }

      // ✅ A) Reduce stock
      product.stock -= item.quantity;
      product.salesCount += item.quantity;
      await product.save();

      total += product.price * item.quantity;
    }

    const order = await Order.create({
      user: req.user._id,
      products,
      totalAmount: total
    });

    res.status(201).json(order);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Seller Update Order Status
router.put("/update-status/:orderId", auth, role("seller"), async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.orderId)
      .populate({
        path: "products.product",
        populate: { path: "shop" }
      });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status;
    await order.save();

    res.json({ message: "Order status updated", order });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Seller Dashboard Stats
router.get("/seller-stats", auth, role("seller"), async (req, res) => {
  try {
    const shop = await Shop.findOne({ owner: req.user._id });

    if (!shop) {
      return res.status(400).json({ message: "Shop not found" });
    }

    const orders = await Order.find()
      .populate({
        path: "products.product",
        populate: { path: "shop" }
      });

    const sellerOrders = orders.filter(order =>
      order.products.some(item =>
        item.product.shop &&
        item.product.shop._id.toString() === shop._id.toString()
      )
    );

    const totalOrders = sellerOrders.length;

    const totalRevenue = sellerOrders.reduce((sum, order) => {
      return sum + order.totalAmount;
    }, 0);

    res.json({
      totalOrders,
      totalRevenue
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get My Orders
router.get("/my-orders", auth, async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
  .populate({
  path: "products.product",
  populate: {
    path: "shop"
  }
});


  res.json(orders);
});

module.exports = router;
