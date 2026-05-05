const express = require("express");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const Order = require("../models/Order");
const PDFDocument = require("pdfkit");
const {
  calculateAverageRating
} = require("../services/reviewModerationService");

const router = express.Router();

const getSellerShop = async (userId) => {
  return Shop.findOne({ owner: userId });
};

const getInventoryStatus = (stock) => {
  if ((stock || 0) <= 0) return "out";
  if ((stock || 0) < 10) return "low";
  return "in";
};

const dayKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildLastNDays = (days) => {
  const now = new Date();
  return Array.from({ length: days })
    .map((_, idx) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (days - 1 - idx));
      return dayKey(d);
    });
};

const parseOllamaBullets = (text) => {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 6);
};

const callOllamaInventory = async (prompt) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama",
        prompt,
        stream: false
      }),
      signal: controller.signal
    });
    if (!res.ok) return [];
    const data = await res.json();
    return parseOllamaBullets(data?.response);
  } catch (_err) {
    return [];
  } finally {
    clearTimeout(timeout);
  }
};

const moderationSnapshot = (review, context = {}) => ({
  reviewId: review._id,
  status: review?.moderation?.status || "approved",
  riskScore: review?.moderation?.riskScore || 0,
  categories: review?.moderation?.categories || [],
  reasons: review?.moderation?.reasons || [],
  comment: review?.comment || "",
  rating: review?.rating || 0,
  name: review?.name || "Anonymous",
  createdAt: review?.createdAt || null,
  context
});

// Seller summary for dashboard
router.get("/summary", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json({ products: 0, orders: 0, revenue: 0 });

    const products = await Product.find({ shop: shop._id }).select("_id");
    const productIds = products.map(p => p._id);

    const orders = await Order.find({
      "products.product": { $in: productIds }
    });

    const revenue = orders.reduce((sum, order) => {
      if (order.paymentStatus === "paid") {
        return sum + (order.totalAmount || 0);
      }
      return sum;
    }, 0);

    res.json({
      products: products.length,
      orders: orders.length,
      revenue
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Seller payment/settlement summary from online orders
router.get("/payments/summary", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) {
      return res.json({
        grossSales: 0,
        platformFee: 0,
        netReceivable: 0,
        paidOrders: 0,
        pendingSettlements: 0,
      });
    }

    const orders = await Order.find({
      paymentStatus: "paid",
      $or: [
        { "sellerSettlements.seller": req.user._id },
        { "products.product": { $exists: true } }
      ]
    }).populate({
      path: "products.product",
      select: "shop price"
    });

    let grossSales = 0;
    let platformFee = 0;
    let netReceivable = 0;
    let paidOrders = 0;
    let pendingSettlements = 0;

    orders.forEach((order) => {
      if (Array.isArray(order.sellerSettlements) && order.sellerSettlements.length) {
        const own = order.sellerSettlements.filter(
          (s) => String(s.seller) === String(req.user._id)
        );
        if (!own.length) return;
        paidOrders += 1;
        own.forEach((s) => {
          grossSales += Number(s.grossAmount || 0);
          platformFee += Number(s.platformFee || 0);
          netReceivable += Number(s.netAmount || 0);
          if (s.status !== "settled") pendingSettlements += 1;
        });
        return;
      }

      // Fallback for historical orders created before settlement fields existed
      let sellerGross = 0;
      (order.products || []).forEach((line) => {
        const p = line.product;
        if (!p || String(p.shop) !== String(shop._id)) return;
        sellerGross += Number(p.price || 0) * Number(line.quantity || 0);
      });
      if (!sellerGross) return;
      paidOrders += 1;
      const fee = (sellerGross * 5) / 100;
      grossSales += sellerGross;
      platformFee += fee;
      netReceivable += sellerGross - fee;
      pendingSettlements += 1;
    });

    return res.json({
      grossSales: Number(grossSales.toFixed(2)),
      platformFee: Number(platformFee.toFixed(2)),
      netReceivable: Number(netReceivable.toFixed(2)),
      paidOrders,
      pendingSettlements,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Seller products
router.get("/products", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json([]);

    const products = await Product.find({ shop: shop._id });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Seller inventory items + status + sales signals
router.get("/inventory/items", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json([]);

    const products = await Product.find({ shop: shop._id }).sort({ updatedAt: -1 });
    const productIds = products.map((p) => p._id);
    const priceMap = products.reduce((acc, p) => {
      acc[String(p._id)] = Number(p.price || 0);
      return acc;
    }, {});
    if (!productIds.length) return res.json([]);

    const orders = await Order.find({
      "products.product": { $in: productIds }
    }).select("products createdAt paymentStatus");

    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    const sales7 = {};
    const sales30 = {};
    const revenue30 = {};

    orders.forEach((order) => {
      const ageDays = (now - new Date(order.createdAt).getTime()) / msDay;
      const isPaid = order.paymentStatus === "paid";
      (order.products || []).forEach((line) => {
        const pid = String(line.product);
        const qty = Number(line.quantity || 0);
        if (!qty) return;
        if (ageDays <= 7) sales7[pid] = (sales7[pid] || 0) + qty;
        if (ageDays <= 30) sales30[pid] = (sales30[pid] || 0) + qty;
        if (ageDays <= 30 && isPaid) {
          revenue30[pid] = (revenue30[pid] || 0) + (priceMap[pid] || 0) * qty;
        }
      });
    });

    const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];
    const competitorAvg = await Product.aggregate([
      {
        $match: {
          category: { $in: categories },
          shop: { $ne: shop._id }
        }
      },
      {
        $group: {
          _id: "$category",
          avgPrice: { $avg: "$price" }
        }
      }
    ]);
    const competitorMap = competitorAvg.reduce((acc, x) => {
      acc[x._id] = Number(x.avgPrice || 0);
      return acc;
    }, {});

    const items = products.map((p) => {
      const pid = String(p._id);
      const stock = Number(p.stock || 0);
      const last7Sales = Number(sales7[pid] || 0);
      const last30Sales = Number(sales30[pid] || 0);
      const categoryAvg = competitorMap[p.category] || 0;
      const price = Number(p.price || 0);
      const status = getInventoryStatus(stock);

      let priceSuggestion = null;
      if (categoryAvg > 0 && price > categoryAvg * 1.05 && stock > 15) {
        const reduceBy = Math.max(10, Math.round((price - categoryAvg) * 0.5));
        priceSuggestion = `Reduce by ₹${reduceBy} to improve conversion.`;
      }

      let restockSuggestion = null;
      const projectedNext7 = Math.max(0, Math.round(last7Sales + Math.max(0, last7Sales - last30Sales / 4)));
      if (stock < 10) {
        restockSuggestion = "Restock soon. High demand product risk.";
      } else if (projectedNext7 > stock) {
        const delta = projectedNext7 - stock;
        restockSuggestion = `Increase stock by ~${Math.max(5, delta)} units (demand rising).`;
      }

      const isDeadStock = stock > 50 && last30Sales === 0;

      return {
        _id: p._id,
        name: p.name,
        category: p.category || "General",
        price,
        stock,
        soldCount: Number(p.salesCount || 0),
        last7Sales,
        last30Sales,
        revenue30: Number((revenue30[pid] || 0).toFixed(2)),
        status,
        isDeadStock,
        restockSuggestion,
        priceSuggestion,
        updatedAt: p.updatedAt
      };
    });

    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Seller inventory dashboard + AI insights
router.get("/inventory/overview", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) {
      return res.json({
        totals: {
          totalProducts: 0,
          totalSales: 0,
          lowStockProducts: 0,
          outOfStockProducts: 0,
          revenue: 0
        },
        topSellingProduct: null,
        revenueTrend: [],
        categoryTrend: [],
        aiInventoryInsights: []
      });
    }

    const products = await Product.find({ shop: shop._id });
    const productIds = products.map((p) => p._id);
    const productMap = products.reduce((acc, p) => {
      acc[String(p._id)] = p;
      return acc;
    }, {});

    const orders = await Order.find({
      "products.product": { $in: productIds }
    }).select("products createdAt paymentStatus");

    const trendDays = buildLastNDays(7);
    const revenueByDay = trendDays.reduce((acc, d) => {
      acc[d] = { date: d, revenue: 0, orders: 0 };
      return acc;
    }, {});

    const categoryTrendMap = {};
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    const sold7ByProduct = {};
    const sold30ByProduct = {};
    let paidRevenue = 0;

    orders.forEach((order) => {
      const orderDateKey = dayKey(order.createdAt);
      const ageDays = (now - new Date(order.createdAt).getTime()) / msDay;
      let orderRevenueFromSeller = 0;

      (order.products || []).forEach((line) => {
        const pid = String(line.product);
        const product = productMap[pid];
        if (!product) return;

        const qty = Number(line.quantity || 0);
        const lineRevenue = Number(product.price || 0) * qty;
        orderRevenueFromSeller += lineRevenue;

        const category = product.category || "General";
        if (!categoryTrendMap[category]) {
          categoryTrendMap[category] = { category, sold7: 0, sold30: 0, stock: 0 };
        }
        if (ageDays <= 7) {
          categoryTrendMap[category].sold7 += qty;
          sold7ByProduct[pid] = (sold7ByProduct[pid] || 0) + qty;
        }
        if (ageDays <= 30) {
          categoryTrendMap[category].sold30 += qty;
          sold30ByProduct[pid] = (sold30ByProduct[pid] || 0) + qty;
        }
      });

      if (order.paymentStatus === "paid") {
        paidRevenue += orderRevenueFromSeller;
        if (revenueByDay[orderDateKey]) {
          revenueByDay[orderDateKey].revenue += orderRevenueFromSeller;
          revenueByDay[orderDateKey].orders += 1;
        }
      }
    });

    products.forEach((p) => {
      const category = p.category || "General";
      if (!categoryTrendMap[category]) {
        categoryTrendMap[category] = { category, sold7: 0, sold30: 0, stock: 0 };
      }
      categoryTrendMap[category].stock += Number(p.stock || 0);
    });

    const lowStockProducts = products.filter((p) => Number(p.stock || 0) < 10 && Number(p.stock || 0) > 0);
    const outOfStockProducts = products.filter((p) => Number(p.stock || 0) <= 0);
    const topSellingProduct = [...products].sort((a, b) => Number(b.salesCount || 0) - Number(a.salesCount || 0))[0] || null;

    const ruleInsights = [];
    lowStockProducts.slice(0, 4).forEach((p) => {
      ruleInsights.push(`${p.name}: low stock (${p.stock}). Restock soon.`);
    });
    products.forEach((p) => {
      const pid = String(p._id);
      const sold7 = Number(sold7ByProduct[pid] || 0);
      const sold30 = Number(sold30ByProduct[pid] || 0);
      if (sold7 > sold30 / 4 && sold7 >= 5) {
        ruleInsights.push(`${p.name}: demand rising. Increase stock by ~20%.`);
      }
      if (Number(p.stock || 0) > 50 && sold30 === 0) {
        ruleInsights.push(`${p.name}: dead stock risk. Consider discount campaign.`);
      }
    });

    const aiPrompt = `Analyze seller inventory. Return short actionable bullets.
Total products: ${products.length}
Low stock count: ${lowStockProducts.length}
Out of stock count: ${outOfStockProducts.length}
Top product: ${topSellingProduct?.name || "N/A"}
Category trend: ${JSON.stringify(Object.values(categoryTrendMap))}
Rules: ${JSON.stringify(ruleInsights.slice(0, 8))}
Focus on restock, pricing, and dead stock actions.`;
    const ollamaInsights = await callOllamaInventory(aiPrompt);

    return res.json({
      totals: {
        totalProducts: products.length,
        totalSales: products.reduce((sum, p) => sum + Number(p.salesCount || 0), 0),
        lowStockProducts: lowStockProducts.length,
        outOfStockProducts: outOfStockProducts.length,
        revenue: Number(paidRevenue.toFixed(2))
      },
      topSellingProduct: topSellingProduct
        ? {
            _id: topSellingProduct._id,
            name: topSellingProduct.name,
            salesCount: topSellingProduct.salesCount || 0,
            stock: topSellingProduct.stock || 0
          }
        : null,
      revenueTrend: trendDays.map((d) => ({
        date: d,
        revenue: Number((revenueByDay[d]?.revenue || 0).toFixed(2)),
        orders: revenueByDay[d]?.orders || 0
      })),
      categoryTrend: Object.values(categoryTrendMap).sort((a, b) => b.sold7 - a.sold7),
      aiInventoryInsights: [...ruleInsights, ...ollamaInsights].slice(0, 12)
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Seller update inventory fields
router.put("/inventory/:productId", auth, role("seller"), async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock, price, category, name } = req.body || {};
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const product = await Product.findOne({ _id: productId, shop: shop._id });
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (stock !== undefined) {
      const val = Number(stock);
      if (Number.isNaN(val) || val < 0) return res.status(400).json({ message: "Invalid stock" });
      product.stock = val;
    }
    if (price !== undefined) {
      const val = Number(price);
      if (Number.isNaN(val) || val < 0) return res.status(400).json({ message: "Invalid price" });
      product.price = val;
    }
    if (typeof category === "string" && category.trim()) product.category = category.trim();
    if (typeof name === "string" && name.trim()) product.name = name.trim();

    await product.save();
    return res.json({ message: "Inventory updated", product });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Seller review moderation queue
router.get("/reviews/moderation", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json({ shopReviews: [], productReviews: [] });

    const shopReviews = (shop.reviews || [])
      .filter((r) => ["flagged", "rejected"].includes(r?.moderation?.status))
      .map((r) =>
        moderationSnapshot(r, { type: "shop", shopId: shop._id, shopName: shop.shopName })
      );

    const products = await Product.find({ shop: shop._id }).select("name reviews");
    const productReviews = products.flatMap((product) =>
      (product.reviews || [])
        .filter((r) => ["flagged", "rejected"].includes(r?.moderation?.status))
        .map((r) =>
          moderationSnapshot(r, {
            type: "product",
            productId: product._id,
            productName: product.name
          })
        )
    );

    res.json({ shopReviews, productReviews });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Seller moderation decision (approve/reject)
router.put("/reviews/moderation/:type/:itemId/:reviewId", auth, role("seller"), async (req, res) => {
  try {
    const { type, itemId, reviewId } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid moderation status" });
    }

    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    if (type === "shop") {
      if (String(shop._id) !== String(itemId)) {
        return res.status(403).json({ message: "Not allowed" });
      }
      const review = shop.reviews.id(reviewId);
      if (!review) return res.status(404).json({ message: "Review not found" });
      review.moderation = {
        ...(review.moderation || {}),
        status,
        publicVisible: status === "approved",
        reviewedAt: new Date()
      };
      shop.rating = calculateAverageRating(shop.reviews || []);
      await shop.save();
      return res.json({ message: "Moderation updated", status });
    }

    if (type === "product") {
      const product = await Product.findOne({ _id: itemId, shop: shop._id });
      if (!product) return res.status(404).json({ message: "Product not found" });
      const review = product.reviews.id(reviewId);
      if (!review) return res.status(404).json({ message: "Review not found" });
      review.moderation = {
        ...(review.moderation || {}),
        status,
        publicVisible: status === "approved",
        reviewedAt: new Date()
      };
      product.averageRating = calculateAverageRating(product.reviews || []);
      await product.save();
      return res.json({ message: "Moderation updated", status });
    }

    return res.status(400).json({ message: "Invalid moderation type" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Seller orders
router.get("/orders", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json([]);

    const products = await Product.find({ shop: shop._id }).select("_id");
    const productIds = products.map(p => p._id);

    const orders = await Order.find({
      "products.product": { $in: productIds }
    })
      .populate("user", "name email")
      .populate({
        path: "products.product",
        populate: { path: "shop" }
      });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update order status (seller)
router.put("/orders/:id/status", auth, role("seller"), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const products = await Product.find({ shop: shop._id }).select("_id");
    const productIds = products.map(p => p._id);

    const order = await Order.findOne({
      _id: req.params.id,
      "products.product": { $in: productIds }
    });
    if (!order) return res.status(404).json({ message: "Order not found" });

    order.status = status;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status,
      at: new Date(),
      by: req.user?.name || "seller"
    });
    await order.save();

    res.json({ message: "Status updated", status: order.status });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Download invoice PDF
router.get("/orders/:id/invoice", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(404).json({ message: "Shop not found" });

    const products = await Product.find({ shop: shop._id }).select("_id");
    const productIds = products.map(p => p._id);

    const order = await Order.findOne({
      _id: req.params.id,
      "products.product": { $in: productIds }
    })
      .populate("user", "name email")
      .populate({
        path: "products.product",
        populate: { path: "shop" }
      });

    if (!order) return res.status(404).json({ message: "Order not found" });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=invoice-${order._id}.pdf`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    doc.fontSize(18).text("Invoice", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Order ID: ${order._id}`);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleString()}`);
    doc.text(`Customer: ${order.user?.name || "-"}`);
    doc.text(`Email: ${order.user?.email || "-"}`);
    doc.moveDown();

    doc.fontSize(12).text("Items:");
    doc.moveDown(0.5);
    order.products?.forEach((p) => {
      doc.fontSize(10).text(
        `${p.product?.name || "Product"}  x${p.quantity}  ₹${p.product?.price || 0}`
      );
    });
    doc.moveDown();

    doc.fontSize(10).text(`GST: ₹${order.gstAmount || 0}`);
    doc.text(`Delivery Charge: ₹${order.deliveryCharge || 0}`);
    doc.fontSize(12).text(`Total: ₹${order.totalAmount}`);
    doc.moveDown();

    doc.fontSize(10).text("Shipping Address:");
    const addr = order.deliveryAddress || {};
    doc.text(`${addr.name || "-"}`);
    doc.text(`${addr.line1 || ""} ${addr.line2 || ""}`);
    doc.text(`${addr.city || ""} ${addr.state || ""} ${addr.zip || ""}`);
    doc.text(`${addr.country || ""}`);

    doc.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
