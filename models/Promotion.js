const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema({
  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Shop",
    required: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String
  },
  discountType: {
    type: String,
    enum: ["percent", "flat"],
    default: "percent"
  },
  discountValue: {
    type: Number,
    required: true
  },
  startDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  usageLimit: {
    type: Number,
    default: 0
  },
  usedCount: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model("Promotion", promotionSchema);
