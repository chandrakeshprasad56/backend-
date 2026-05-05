const express = require("express");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");

const router = express.Router();

// Monthly Revenue Chart Data
router.get("/monthly-revenue", auth, role("admin"), async (req, res) => {
  try {
    const monthlyData = await Order.aggregate([
      {
        $match: {
          paymentStatus: "paid"
        }
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          totalRevenue: { $sum: "$totalAmount" }
        }
      },
      {
        $sort: { "_id": 1 }
      }
    ]);

    res.json(monthlyData);

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


/* ===========================
   Admin: Get All Users
=========================== */
router.get("/users", auth, role("admin"), async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

/* ===========================
   Admin: Delete User
=========================== */
router.delete("/users/:id", auth, role("admin"), async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: "User deleted" });
});

/* ===========================
   Admin: Get All Products
=========================== */
router.get("/products", auth, role("admin"), async (req, res) => {
  const products = await Product.find().populate("shop");
  res.json(products);
});

/* ===========================
   Admin: Delete Product
=========================== */
router.delete("/products/:id", auth, role("admin"), async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: "Product deleted" });
});

/* ===========================
   Admin: Get All Orders
=========================== */
router.get("/orders", auth, role("admin"), async (req, res) => {
  const orders = await Order.find()
    .populate("user", "fullName email")
    .populate({
      path: "products.product",
      populate: { path: "shop" }
    });

  res.json(orders);
});

module.exports = router;
