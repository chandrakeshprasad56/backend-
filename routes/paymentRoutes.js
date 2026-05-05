const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const auth = require("../middleware/authMiddleware");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Order = require("../models/Order");

const router = express.Router();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const PLATFORM_FEE_PCT = Number(process.env.PLATFORM_FEE_PCT || 5);

const razorpay =
  RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET
    ? new Razorpay({
        key_id: RAZORPAY_KEY_ID,
        key_secret: RAZORPAY_KEY_SECRET,
      })
    : null;

const toINR2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const toPaise = (n) => Math.max(100, Math.round(Number(n || 0) * 100));

const isAddressValid = (address) => {
  if (!address) return false;
  return !!(address.name && address.phone && address.line1 && address.city);
};

const buildRiskNotes = ({ totalAmount, itemCount, hasLargeQty }) => {
  const reasons = [];
  let riskLevel = "low";
  if (totalAmount >= 15000) {
    reasons.push("High-value order amount.");
    riskLevel = "medium";
  }
  if (itemCount >= 8 || hasLargeQty) {
    reasons.push("Large basket size detected.");
    if (riskLevel === "low") riskLevel = "medium";
  }
  if (!reasons.length) reasons.push("Normal purchase pattern.");
  return {
    riskLevel,
    reasons,
    recommendedAction:
      riskLevel === "low"
        ? "Auto-confirm after successful payment."
        : "Confirm payment and verify address once before packing.",
  };
};

const createOrderDraftFromCart = async ({ userId, deliveryAddress, deliveryLocation }) => {
  const cart = await Cart.findOne({ user: userId }).populate({
    path: "items.product",
    populate: { path: "shop" },
  });

  if (!cart || !cart.items || !cart.items.length) {
    return { error: "Cart is empty" };
  }

  const lines = [];
  let subtotal = 0;
  let hasLargeQty = false;
  let totalItems = 0;

  for (const line of cart.items) {
    const product = line.product;
    const qty = Math.max(1, Number(line.quantity || 1));
    if (!product) return { error: "One or more products in cart are missing." };
    if (Number(product.stock || 0) < qty) {
      return { error: `Not enough stock for ${product.name}` };
    }

    const unitPrice = Number(product.price || 0);
    subtotal += unitPrice * qty;
    totalItems += qty;
    if (qty >= 5) hasLargeQty = true;

    lines.push({
      productId: product._id,
      shopId: product.shop?._id,
      sellerId: product.shop?.owner,
      qty,
      unitPrice,
      lineTotal: unitPrice * qty,
    });
  }

  const deliveryCharge = subtotal >= 500 ? 0 : 40;
  const gstAmount = toINR2(subtotal * 0.05);
  const totalAmount = toINR2(subtotal + deliveryCharge + gstAmount);

  const sellerMap = new Map();
  lines.forEach((line) => {
    const sellerId = String(line.sellerId || "");
    if (!sellerId) return;
    const prev = sellerMap.get(sellerId) || {
      seller: line.sellerId,
      shop: line.shopId,
      grossAmount: 0,
    };
    prev.grossAmount += line.lineTotal;
    sellerMap.set(sellerId, prev);
  });

  const sellerSettlements = Array.from(sellerMap.values()).map((s) => {
    const grossAmount = toINR2(s.grossAmount);
    const platformFee = toINR2((grossAmount * PLATFORM_FEE_PCT) / 100);
    const netAmount = toINR2(grossAmount - platformFee);
    return {
      seller: s.seller,
      shop: s.shop,
      grossAmount,
      platformFee,
      netAmount,
      status: "pending",
    };
  });

  const aiPaymentNotes = buildRiskNotes({
    totalAmount,
    itemCount: totalItems,
    hasLargeQty,
  });

  const orderDoc = await Order.create({
    user: userId,
    products: lines.map((line) => ({
      product: line.productId,
      quantity: line.qty,
    })),
    totalAmount,
    deliveryCharge,
    gstAmount,
    paymentType: "online",
    paymentStatus: "pending",
    status: "pending",
    deliveryAddress,
    deliveryLocation: deliveryLocation || undefined,
    sellerSettlements,
    aiPaymentNotes,
    statusHistory: [{ status: "pending", by: "system" }],
  });

  return {
    orderDoc,
    totals: {
      subtotal: toINR2(subtotal),
      deliveryCharge,
      gstAmount,
      totalAmount,
    },
    lineItems: lines,
    aiPaymentNotes,
  };
};

router.get("/config", auth, async (_req, res) => {
  return res.json({
    provider: "razorpay",
    enabled: !!razorpay,
    keyId: RAZORPAY_KEY_ID || null,
    platformFeePct: PLATFORM_FEE_PCT,
  });
});

router.post("/create-order", auth, async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        message:
          "Online payment is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
    }

    const {
      deliveryAddress,
      deliveryLocation,
    } = req.body || {};

    if (!isAddressValid(deliveryAddress)) {
      return res.status(400).json({
        message: "Delivery address is required (name, phone, line1, city).",
      });
    }

    const draft = await createOrderDraftFromCart({
      userId: req.user._id,
      deliveryAddress,
      deliveryLocation,
    });
    if (draft.error) return res.status(400).json({ message: draft.error });

    const { orderDoc, totals, aiPaymentNotes } = draft;
    const rpOrder = await razorpay.orders.create({
      amount: toPaise(totals.totalAmount),
      currency: "INR",
      receipt: `order_${orderDoc._id}`,
      notes: {
        internalOrderId: String(orderDoc._id),
      },
    });

    orderDoc.razorpayOrderId = rpOrder.id;
    await orderDoc.save();

    return res.json({
      key: RAZORPAY_KEY_ID,
      razorpayOrderId: rpOrder.id,
      amount: rpOrder.amount,
      currency: rpOrder.currency,
      internalOrderId: orderDoc._id,
      totals,
      aiPaymentNotes,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/verify", auth, async (req, res) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      internalOrderId,
    } = req.body || {};

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !internalOrderId) {
      return res.status(400).json({ message: "Missing payment verification fields." });
    }
    if (!RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ message: "Payment secret not configured." });
    }

    const generatedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    if (generatedSignature !== razorpaySignature) {
      return res.status(400).json({ message: "Invalid payment signature." });
    }

    const order = await Order.findOne({
      _id: internalOrderId,
      user: req.user._id,
      razorpayOrderId,
    }).populate("products.product");

    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.paymentStatus === "paid") {
      return res.json({ message: "Payment already verified.", order });
    }

    for (const line of order.products) {
      const product = await Product.findById(line.product?._id || line.product);
      if (!product) return res.status(400).json({ message: "Product missing during payment verification." });
      if (Number(product.stock || 0) < Number(line.quantity || 0)) {
        return res.status(400).json({
          message: `Payment received but stock unavailable for ${product.name}. Please contact support.`,
        });
      }
    }

    for (const line of order.products) {
      const product = await Product.findById(line.product?._id || line.product);
      const qty = Number(line.quantity || 0);
      product.stock = Math.max(0, Number(product.stock || 0) - qty);
      product.salesCount = Number(product.salesCount || 0) + qty;
      await product.save();
    }

    order.paymentStatus = "paid";
    order.status = "confirmed";
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    order.statusHistory.push({ status: "confirmed", by: "payment-system" });
    await order.save();

    await Cart.updateOne(
      { user: req.user._id },
      { $set: { items: [] } },
      { upsert: true }
    );

    return res.json({
      message: "Payment verified and order confirmed.",
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      status: order.status,
      sellerSettlements: order.sellerSettlements || [],
      aiPaymentNotes: order.aiPaymentNotes || null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;

