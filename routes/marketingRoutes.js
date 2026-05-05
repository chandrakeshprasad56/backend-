const express = require("express");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const Shop = require("../models/Shop");
const Product = require("../models/Product");
const Cart = require("../models/Cart");
const Order = require("../models/Order");
const Promotion = require("../models/Promotion");
const Campaign = require("../models/Campaign");

const router = express.Router();

const getSellerShop = async (userId) => {
  return Shop.findOne({ owner: userId });
};

const callOllama = async (prompt) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "tinyllama",
        prompt,
        stream: false
      }),
      signal: controller.signal
    });
    if (!response.ok) return "";
    const data = await response.json();
    return data?.response || "";
  } catch (_error) {
    return "";
  } finally {
    clearTimeout(timeout);
  }
};

const randomCouponCode = (prefix = "DIGI", length = 6) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix.toUpperCase();
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const summarizeByChannel = (campaigns = []) => {
  const map = {};
  campaigns.forEach((c) => {
    const channel = c.channel || "social";
    if (!map[channel]) {
      map[channel] = {
        channel,
        campaigns: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        conversionRate: 0
      };
    }
    map[channel].campaigns += 1;
    map[channel].impressions += c.metrics?.impressions || 0;
    map[channel].clicks += c.metrics?.clicks || 0;
    map[channel].conversions += c.metrics?.conversions || 0;
  });
  return Object.values(map).map((x) => ({
    ...x,
    ctr: x.impressions ? Number(((x.clicks / x.impressions) * 100).toFixed(2)) : 0,
    conversionRate: x.clicks ? Number(((x.conversions / x.clicks) * 100).toFixed(2)) : 0
  }));
};

const generateRetargetingSegments = ({ abandonedCarts, activeCoupons }) => {
  return abandonedCarts.map((cart) => {
    const value = cart.total || 0;
    const itemCount = cart.itemsCount || 0;
    const days = cart.idleHours / 24;
    let segment = "warm";
    if (value >= 2000) segment = "high_value";
    if (days >= 3) segment = "cold";
    if (itemCount >= 5) segment = "bulk";

    const suggestedDiscount =
      segment === "high_value" ? 10 : segment === "cold" ? 20 : segment === "bulk" ? 15 : 12;

    const existingCoupon = activeCoupons.find((c) => (c.discountValue || 0) >= suggestedDiscount);

    const message =
      segment === "high_value"
        ? `Hi ${cart.userName}, your cart is almost ready. Complete your order today for priority delivery.`
        : segment === "cold"
        ? `Hi ${cart.userName}, we saved your cart items. Use a comeback offer and checkout now.`
        : segment === "bulk"
        ? `Hi ${cart.userName}, your bulk cart qualifies for extra savings. Complete checkout to unlock the deal.`
        : `Hi ${cart.userName}, your selected items are still available. Complete your order before stock runs out.`;

    return {
      ...cart,
      segment,
      suggestedDiscount,
      suggestedCouponCode: existingCoupon?.code || null,
      message
    };
  });
};

const templates = {
  instagram: [
    {
      title: "Top 5 Medical Shops in Noida",
      caption: "Top 5 trusted medical shops in Noida you can rely on for fast delivery and genuine products. Save this post for later."
    },
    {
      title: "Trending Product Reel",
      caption: "Trending now: {product}. Why customers love it and where to get it near you. Limited stock alert."
    }
  ],
  facebook: [
    {
      title: "Shop Owner Interview",
      caption: "Meet the owner behind {shop}. Learn how quality and service made this one of the top-rated stores in your area."
    },
    {
      title: "Customer Testimonial",
      caption: "Real customer story: '{quote}'. Thank you for trusting us."
    }
  ],
  youtube: [
    {
      title: "AI Features Demo",
      caption: "How AI Smart Search helps users find the right products faster in Noida and Greater Noida."
    },
    {
      title: "Weekly Shop Roundup",
      caption: "This week’s best sellers, top offers, and delivery updates. Subscribe for weekly updates."
    }
  ]
};

// Promotions
router.post("/promotions", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(400).json({ message: "Create shop first" });

    const promotion = await Promotion.create({
      shop: shop._id,
      code: req.body.code,
      description: req.body.description,
      discountType: req.body.discountType,
      discountValue: req.body.discountValue,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      usageLimit: req.body.usageLimit
    });

    res.status(201).json(promotion);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/promotions", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json([]);

    const promotions = await Promotion.find({ shop: shop._id }).sort({ createdAt: -1 });
    res.json(promotions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Campaigns
router.post("/campaigns", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(400).json({ message: "Create shop first" });

    const campaign = await Campaign.create({
      shop: shop._id,
      name: req.body.name,
      channel: req.body.channel,
      content: req.body.content,
      status: req.body.status,
      startDate: req.body.startDate,
      endDate: req.body.endDate
    });

    res.status(201).json(campaign);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/campaigns", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json([]);

    const campaigns = await Campaign.find({ shop: shop._id }).sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Content templates for digital marketing panel
router.get("/templates", auth, role("seller"), async (req, res) => {
  res.json(templates);
});

// Calendar-style data for campaigns grouped by date
router.get("/calendar", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json({});
    const campaigns = await Campaign.find({ shop: shop._id }).sort({ startDate: 1 });
    const grouped = campaigns.reduce((acc, c) => {
      const key = c.startDate ? new Date(c.startDate).toISOString().slice(0, 10) : "unscheduled";
      if (!acc[key]) acc[key] = [];
      acc[key].push({
        id: c._id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        content: c.content,
        endDate: c.endDate
      });
      return acc;
    }, {});
    res.json(grouped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Simple metrics summary
router.get("/metrics", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json({ impressions: 0, clicks: 0, conversions: 0 });

    const campaigns = await Campaign.find({ shop: shop._id });
    const summary = campaigns.reduce((acc, c) => {
      acc.impressions += c.metrics.impressions || 0;
      acc.clicks += c.metrics.clicks || 0;
      acc.conversions += c.metrics.conversions || 0;
      return acc;
    }, { impressions: 0, clicks: 0, conversions: 0 });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Social strategy with content ideas + platform analytics
router.get("/social-strategy", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) {
      return res.json({
        contentIdeas: [],
        performance: [],
        aiSuggestions: []
      });
    }

    const [campaigns, products] = await Promise.all([
      Campaign.find({ shop: shop._id }).sort({ createdAt: -1 }),
      Product.find({ shop: shop._id }).sort({ salesCount: -1, averageRating: -1 }).limit(20)
    ]);

    const performance = summarizeByChannel(campaigns);
    const topProducts = products.slice(0, 5);
    const topCategories = [...new Set(products.map((p) => p.category).filter(Boolean))].slice(0, 4);

    const contentIdeas = [
      {
        platform: "Instagram",
        type: "Reel",
        title: "Top products this week",
        idea: `Show quick clips of ${topProducts.map((p) => p.name).slice(0, 3).join(", ") || "your top products"} with price tags.`
      },
      {
        platform: "Facebook",
        type: "Carousel",
        title: "Category spotlight",
        idea: `Highlight categories: ${topCategories.join(", ") || "Medicine, Grocery, Electronics"} with customer benefits.`
      },
      {
        platform: "YouTube",
        type: "Short Demo",
        title: "How to choose better",
        idea: "Record a 60-second buyer guide explaining quality checks and delivery expectations."
      },
      {
        platform: "Instagram",
        type: "Story Poll",
        title: "Demand signal",
        idea: "Ask users which product they want discounted this weekend and use poll result for campaign."
      }
    ];

    const aiRaw = await callOllama(
      `You are a digital marketing strategist for a local marketplace shop.
Shop: ${shop.shopName}
Top products: ${topProducts.map((p) => `${p.name}(sales:${p.salesCount || 0})`).join(", ")}
Channel performance: ${JSON.stringify(performance)}
Return 4 short actionable bullets for next 7 days marketing plan.`
    );

    const aiSuggestions = (aiRaw || "")
      .split("\n")
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 6);

    return res.json({
      contentIdeas,
      performance,
      aiSuggestions
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// AI coupon generator
router.post("/coupon/generate", auth, role("seller"), async (req, res) => {
  try {
    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.status(400).json({ message: "Create shop first" });

    const {
      goal = "conversion",
      discountType = "percent",
      discountValue,
      usageLimit = 100,
      expiresInDays = 7,
      minOrderValue = 0
    } = req.body || {};

    const chosenDiscount =
      Number(discountValue) > 0
        ? Number(discountValue)
        : goal === "retention"
        ? 20
        : goal === "high_value"
        ? 10
        : 15;

    const code = randomCouponCode("DIGI", 6);
    const now = new Date();
    const endDate = new Date(now.getTime() + Number(expiresInDays || 7) * 24 * 60 * 60 * 1000);

    const aiDescription = await callOllama(
      `Write one-line coupon offer copy.
Goal: ${goal}
Discount: ${chosenDiscount} ${discountType}
Shop: ${shop.shopName}
Tone: short, urgent, local marketplace`
    );

    const description =
      aiDescription?.trim() ||
      `${chosenDiscount}${discountType === "percent" ? "%" : " INR"} off for a limited time.`;

    const promotion = await Promotion.create({
      shop: shop._id,
      code,
      description,
      discountType,
      discountValue: chosenDiscount,
      startDate: now,
      endDate,
      usageLimit: Number(usageLimit) || 100
    });

    return res.status(201).json({
      promotion,
      strategy: {
        goal,
        minOrderValue: Number(minOrderValue) || 0,
        segmentHint:
          goal === "retention"
            ? "Use for abandoned cart users inactive for 24h+."
            : goal === "high_value"
            ? "Use for carts above ₹2000."
            : "Use for users with first-time or pending checkout."
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Retargeting audience based on abandoned carts
router.get("/retargeting", auth, role("seller"), async (req, res) => {
  try {
    const staleHours = Math.max(1, Number(req.query.staleHours || 6));
    const lookbackDays = Math.max(1, Number(req.query.lookbackDays || 7));

    const shop = await getSellerShop(req.user._id);
    if (!shop) return res.json({ audience: [], summary: { abandonedCarts: 0, users: 0 } });

    const products = await Product.find({ shop: shop._id }).select("_id name");
    const productIds = products.map((p) => p._id);
    if (!productIds.length) return res.json({ audience: [], summary: { abandonedCarts: 0, users: 0 } });

    const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000);
    const carts = await Cart.find({
      updatedAt: { $lte: cutoff },
      "items.product": { $in: productIds }
    })
      .populate("user", "name email")
      .populate("items.product", "name price shop");

    const userIds = carts.map((c) => c.user?._id).filter(Boolean);
    const recentOrderCutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
    const recentOrders = await Order.find({
      user: { $in: userIds },
      createdAt: { $gte: recentOrderCutoff },
      "products.product": { $in: productIds }
    }).select("user");
    const usersWithRecentOrder = new Set(recentOrders.map((o) => String(o.user)));

    const activeCoupons = await Promotion.find({
      shop: shop._id,
      active: true,
      endDate: { $gte: new Date() }
    }).sort({ discountValue: -1 });

    const abandonedCarts = carts
      .filter((cart) => cart.user && !usersWithRecentOrder.has(String(cart.user._id)))
      .map((cart) => {
        const sellerItems = (cart.items || []).filter(
          (i) => i.product && String(i.product.shop) === String(shop._id)
        );
        const total = sellerItems.reduce(
          (sum, i) => sum + (Number(i.product?.price || 0) * Number(i.quantity || 1)),
          0
        );
        const topItems = sellerItems
          .slice(0, 3)
          .map((i) => i.product?.name)
          .filter(Boolean);
        return {
          cartId: cart._id,
          userId: cart.user._id,
          userName: cart.user.name || "Customer",
          userEmail: cart.user.email || "",
          itemsCount: sellerItems.length,
          total: Number(total.toFixed(2)),
          topItems,
          idleHours: Number(((Date.now() - new Date(cart.updatedAt).getTime()) / (1000 * 60 * 60)).toFixed(1))
        };
      });

    const audience = generateRetargetingSegments({ abandonedCarts, activeCoupons });

    return res.json({
      audience,
      summary: {
        abandonedCarts: audience.length,
        users: new Set(audience.map((a) => String(a.userId))).size,
        avgCartValue: audience.length
          ? Number((audience.reduce((sum, a) => sum + a.total, 0) / audience.length).toFixed(2))
          : 0
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
