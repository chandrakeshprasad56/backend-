

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Product = require("./models/Product");
const Shop = require("./models/Shop");
require("dotenv").config();

const app = express();

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/final_year_project";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";
const allowedOrigins = CLIENT_ORIGIN.split(",").map((x) => x.trim()).filter(Boolean);
const SAFE_ELECTRONICS_IMAGE =
  "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg";
const BLOCKED_IMAGE_REGEX = /(6192127|34939748)/i;

async function sanitizeMarketplaceImages() {
  const [fixedProducts, fixedShops, fixedPortableSsd] = await Promise.all([
    Product.updateMany(
      { image: { $regex: BLOCKED_IMAGE_REGEX } },
      { $set: { image: SAFE_ELECTRONICS_IMAGE } }
    ),
    Shop.updateMany(
      { logo: { $regex: BLOCKED_IMAGE_REGEX } },
      { $set: { logo: SAFE_ELECTRONICS_IMAGE } }
    ),
    Product.updateMany(
      { name: "Portable SSD 1TB" },
      { $set: { image: SAFE_ELECTRONICS_IMAGE } }
    ),
  ]);

  console.log(
    `🧹 Image sanitize: products=${fixedProducts.modifiedCount}, shops=${fixedShops.modifiedCount}, portableSsd=${fixedPortableSsd.modifiedCount}`
  );
}

/* ===========================
   Middleware
=========================== */
app.use(cors({
  origin(origin, callback) {
    if (!allowedOrigins.length || allowedOrigins.includes("*")) return callback(null, true);
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed"), false);
  },
  credentials: true
}));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

/* ===========================
   MongoDB Connection
=========================== */
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");
    try {
      await sanitizeMarketplaceImages();
    } catch (error) {
      console.log("⚠️ Image sanitize skipped:", error.message);
    }
  })
  .catch(err => console.log("❌ DB Error:", err));

/* ===========================
   Routes
=========================== */
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/shops", require("./routes/shopRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/payment", require("./routes/paymentRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/wishlist", require("./routes/wishlistRoutes"));
app.use("/api/marketing", require("./routes/marketingRoutes"));
app.use("/api/recommendations", require("./routes/recommendRoutes"));
app.use("/api/seller", require("./routes/sellerRoutes"));
app.use("/api/trending", require("./routes/trendingRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/ai", require("./routes/aiRoutes"));

/* ===========================
   Start Server
=========================== */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
