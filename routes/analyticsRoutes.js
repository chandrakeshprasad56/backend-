const express = require("express");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Shop = require("../models/Shop");

const router = express.Router();

router.get("/summary", async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalShops = await Shop.countDocuments();
    const paidOrders = await Order.find({ paymentStatus: "paid" });

    const revenue = paidOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

    res.json({
      totalProducts,
      totalOrders,
      totalShops,
      revenue
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cart analytics (seller/admin)
router.get("/cart", async (req, res) => {
  try {
    const products = await Product.find().select("name cartAdds cartRemoves price");
    const totalAdds = products.reduce((sum, p) => sum + (p.cartAdds || 0), 0);
    const totalRemoves = products.reduce((sum, p) => sum + (p.cartRemoves || 0), 0);

    const topAdded = [...products]
      .sort((a, b) => (b.cartAdds || 0) - (a.cartAdds || 0))
      .slice(0, 5);

    const conversionRate = totalAdds === 0 ? 0 : Number(((totalAdds - totalRemoves) / totalAdds * 100).toFixed(2));

    res.json({
      totalAdds,
      totalRemoves,
      conversionRate,
      topAdded
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
