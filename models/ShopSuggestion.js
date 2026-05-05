const mongoose = require("mongoose");

const suggestionSchema = new mongoose.Schema(
  {
    shopName: { type: String, required: true },
    address: { type: String },
    city: { type: String },
    phone: { type: String },
    categories: [{ type: String }],
    openingHours: { type: String },
    images: [{ type: String }],
    notes: { type: String },
    status: { type: String, default: "pending" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShopSuggestion", suggestionSchema);
