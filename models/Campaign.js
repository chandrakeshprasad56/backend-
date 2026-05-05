const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Shop",
    required: true
  },
  name: {
    type: String,
    required: true
  },
  channel: {
    type: String,
    enum: ["coupon", "email", "whatsapp", "social", "seo"],
    required: true
  },
  content: {
    type: String
  },
  status: {
    type: String,
    enum: ["draft", "active", "paused", "completed"],
    default: "draft"
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  metrics: {
    impressions: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    conversions: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model("Campaign", campaignSchema);
