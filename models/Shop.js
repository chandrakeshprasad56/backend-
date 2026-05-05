

const mongoose = require("mongoose");

const shopSchema = new mongoose.Schema({
  shopName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  logo: {
    type: String
  },
  phone: {
    type: String
  },
  address: {
    type: String
  },
  city: {
    type: String
  },
  openingHours: {
    type: String // e.g. "09:00-21:00"
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  hasOffers: {
    type: Boolean,
    default: false
  },
  categories: [{
    type: String
  }],
  rating: {
    type: Number,
    default: 0
  },
  reviews: [
    {
      name: { type: String },
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
      images: [{ type: String }],
      helpfulCount: { type: Number, default: 0 },
      verifiedBuyer: { type: Boolean, default: false },
      moderation: {
        status: {
          type: String,
          enum: ["approved", "flagged", "rejected"],
          default: "approved"
        },
        riskScore: {
          type: Number,
          default: 0
        },
        categories: [{ type: String }],
        reasons: [{ type: String }],
        model: { type: String },
        reviewedAt: { type: Date },
        publicVisible: { type: Boolean, default: true },
        ai: { type: mongoose.Schema.Types.Mixed }
      },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true });

shopSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Shop", shopSchema);
