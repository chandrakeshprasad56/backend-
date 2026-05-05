const express = require("express");
const axios = require("axios");
const auth = require("../middleware/authMiddleware");
const role = require("../middleware/roleMiddleware");
const Product = require("../models/Product");
const Shop = require("../models/Shop");
const { normalizePublicImage } = require("../utils/imageFallback");

const router = express.Router();

const ollamaGenerate = async (prompt) => {
  try {
    const res = await axios.post("http://localhost:11434/api/generate", {
      model: "tinyllama",
      prompt,
      stream: false
    }, {
      timeout: 9000
    });
    return res.data?.response || "";
  } catch (_error) {
    return "";
  }
};

// AI product description (seller)
router.post("/product-description", auth, role("seller"), async (req, res) => {
  try {
    const { name, category, features } = req.body;
    const prompt = `Write a concise, attractive product description for:
Name: ${name}
Category: ${category}
Features: ${features || "N/A"}
Keep it under 80 words.`;
    const response = await ollamaGenerate(prompt);
    res.json({ description: response });
  } catch (error) {
    res.status(500).json({ message: "AI error", error: error.message });
  }
});

// AI analytics summary (admin/seller)
router.post("/analytics", auth, role("seller", "admin"), async (req, res) => {
  try {
    const { text } = req.body;
    const prompt = `Summarize sales and trends based on this data in 5 bullets:\n${text}`;
    const response = await ollamaGenerate(prompt);
    res.json({ summary: response });
  } catch (error) {
    res.status(500).json({ message: "AI error", error: error.message });
  }
});

// AI smart search (products/shops)
router.post("/search", async (req, res) => {
  try {
    const { query, location, language } = req.body;
    const prompt = `You are a marketplace search assistant.
User query: ${query}
Location: ${location || "India"}
Language: ${language || "English"}
Return ONLY valid JSON with keys:
intent (string),
keywords (array of strings),
location (string),
category (string or null),
minRating (number or null),
maxPrice (number or null),
radiusKm (number or null),
openNow (boolean).`;
    const response = await ollamaGenerate(prompt);
    let parsed = null;
    try {
      parsed = JSON.parse(response);
    } catch (e) {
      const q = String(query || "").toLowerCase();
      const numberMatch = q.match(/(\d+(?:\.\d+)?)/);
      const maxPrice = q.includes("under") || q.includes("below") || q.includes("₹")
        ? (numberMatch ? Number(numberMatch[1]) : null)
        : null;
      const ratingMatch = q.match(/(\d(?:\.\d)?)\s*\+?\s*star/);
      const rating = ratingMatch ? Number(ratingMatch[1]) : null;
      const radiusMatch = q.match(/(\d+)\s*(km| किलो)/);
      const radiusKm = radiusMatch ? Number(radiusMatch[1]) : null;
      const openNow = q.includes("open") || q.includes("खुला") || q.includes("खुली");
      const categoryWords = [
        { words: ["medicine", "medical", "pharmacy", "दवा", "मेडिसिन", "फार्मेसी"], category: "Medicine" },
        { words: ["grocery", "groceries", "किराना", "ग्रोसरी"], category: "Grocery" },
        { words: ["electronics", "electronic", "मोबाइल", "लैपटॉप", "इलेक्ट्रॉनिक्स"], category: "Electronics" },
        { words: ["fashion", "कपड़े", "फैशन"], category: "Fashion" },
        { words: ["beauty", "कॉस्मेटिक", "ब्यूटी"], category: "Beauty" },
        { words: ["hardware", "टूल", "हार्डवेयर"], category: "Hardware" },
        { words: ["stationery", "स्टेशनरी", "कॉपी", "पेन"], category: "Stationery" },
        { words: ["home essentials", "घर", "होम"], category: "Home Essentials" },
      ];
      const foundCategory =
        (categoryWords.find((entry) => entry.words.some((w) => q.includes(w))) || {}).category || null;

      parsed = {
        intent: "search",
        keywords: String(query || "").split(" ").filter(Boolean).slice(0, 6),
        location: location || "India",
        category: foundCategory,
        minRating: rating,
        maxPrice,
        radiusKm,
        openNow
      };
    }
    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywordRegex = keywords.length ? new RegExp(keywords.join("|"), "i") : null;

    const productFilter = keywordRegex
      ? { $or: [{ name: keywordRegex }, { category: keywordRegex }] }
      : {};

    const shopFilter = keywordRegex
      ? { $or: [{ shopName: keywordRegex }, { categories: { $in: keywords } }] }
      : {};

    if (parsed.category) {
      shopFilter.categories = { $in: [parsed.category] };
      productFilter.category = { $regex: parsed.category, $options: "i" };
    }

    if (parsed.location) {
      shopFilter.city = { $regex: parsed.location, $options: "i" };
    } else if (location) {
      shopFilter.city = { $regex: location, $options: "i" };
    }

    const productsRaw = await Product.find(productFilter).limit(12).populate("shop");
    const shopsRaw = await Shop.find(shopFilter).limit(12);
    const products = productsRaw.map((p) => {
      const obj = p.toObject ? p.toObject() : p;
      return {
        ...obj,
        image: normalizePublicImage(obj.image, obj.category),
      };
    });
    const shops = shopsRaw.map((s) => {
      const obj = s.toObject ? s.toObject() : s;
      const primaryCategory = Array.isArray(obj.categories) && obj.categories.length
        ? obj.categories[0]
        : "Home Essentials";
      return {
        ...obj,
        logo: normalizePublicImage(obj.logo, primaryCategory),
      };
    });

    let shopRecommendations = {};
    if (shops.length) {
      const shopSummaries = shops.map((s) => ({
        id: String(s._id),
        name: s.shopName,
        rating: s.rating || 0,
        categories: s.categories || [],
        city: s.city || "",
        reviews: (s.reviews || []).length,
        hasOffers: !!s.hasOffers,
        isVerified: !!s.isVerified,
        openingHours: s.openingHours || "09:00-21:00"
      }));
      const recPrompt = `You are a shop recommendation engine.
User query: ${query}
Location: ${location || "India"}
Shops: ${JSON.stringify(shopSummaries)}
Return ONLY valid JSON array. Each item: { "id": "shopId", "reasons": ["short reason 1", "short reason 2"] }.
Keep reasons factual and based on the shop data (rating, reviews, category, city, offers, verified, openingHours). Max 3 reasons.`;
      const recRaw = await ollamaGenerate(recPrompt);
      try {
        const parsedRec = JSON.parse(recRaw);
        if (Array.isArray(parsedRec)) {
          parsedRec.forEach((r) => {
            if (r && r.id) {
              shopRecommendations[String(r.id)] = Array.isArray(r.reasons) ? r.reasons.slice(0, 3) : [];
            }
          });
        }
      } catch (e) {
        // fallback: simple reasons
        shops.forEach((s) => {
          const reasons = [];
          if ((s.rating || 0) >= 4.5) reasons.push("High rating");
          if ((s.reviews || []).length >= 3) reasons.push("Popular with reviews");
          if (s.hasOffers) reasons.push("Active offers");
          shopRecommendations[String(s._id)] = reasons.slice(0, 3);
        });
      }
    }

    res.json({ raw: response, parsed, products, shops, shopRecommendations });
  } catch (error) {
    res.status(500).json({ message: "AI error", error: error.message });
  }
});

// AI smart cart prediction
router.post("/cart-predict", async (req, res) => {
  try {
    const { cart, location } = req.body;
    const prompt = `You are a smart cart assistant.
Location: ${location || "India"}
Cart items: ${JSON.stringify(cart || [])}
Suggest 3 add-on items and short reasons.`;
    const response = await ollamaGenerate(prompt);
    const cartNames = (cart || []).map((c) => String(c.name || "").toLowerCase());
    const suggestions = await Product.find({
      name: { $not: { $in: cartNames.map((n) => new RegExp(n, "i")) } }
    })
      .sort({ salesCount: -1, averageRating: -1 })
      .limit(6)
      .populate("shop");

    res.json({ suggestion: response, items: suggestions });
  } catch (error) {
    res.status(500).json({ message: "AI error", error: error.message });
  }
});

// AI product Q&A
router.post("/product-qa", async (req, res) => {
  try {
    const { product, question } = req.body;
    const prompt = `You are a product expert. Answer the user's question based on this product data.
Product: ${JSON.stringify(product)}
Question: ${question}
Answer in 2-4 sentences.`;
    const response = await ollamaGenerate(prompt);
    res.json({ answer: response });
  } catch (error) {
    res.status(500).json({ message: "AI error", error: error.message });
  }
});

// AI generic prompt (public)
router.post("/generate", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ message: "Prompt required" });
    const response = await ollamaGenerate(prompt);
    res.json({ response });
  } catch (error) {
    res.status(500).json({ message: "AI error", error: error.message });
  }
});

module.exports = router;
