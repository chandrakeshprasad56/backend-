
const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  products: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },
      quantity: {
        type: Number,
        required: true
      }
    }
  ],
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled", "returned"],
    default: "pending"
  },

  deliveryAddress: {
    name: { type: String },
    phone: { type: String },
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String, default: "India" }
  },

  deliveryCharge: {
    type: Number,
    default: 0
  },

  gstAmount: {
    type: Number,
    default: 0
  },

  paymentType: {
    type: String,
    enum: ["cod", "online"],
    default: "online"
  },

  deliveryLocation: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point"
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: [0, 0]
    }
  },

  statusHistory: [
    {
      status: { type: String },
      at: { type: Date, default: Date.now },
      by: { type: String }
    }
  ],

  // ✅ Payment Fields
  paymentStatus: {
    type: String,
    enum: ["pending", "paid"],
    default: "pending"
  },
  razorpayOrderId: {
    type: String
  },
  razorpayPaymentId: {
    type: String
  },
  razorpaySignature: {
    type: String
  },

  sellerSettlements: [
    {
      seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      shop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Shop"
      },
      grossAmount: {
        type: Number,
        default: 0
      },
      platformFee: {
        type: Number,
        default: 0
      },
      netAmount: {
        type: Number,
        default: 0
      },
      status: {
        type: String,
        enum: ["pending", "settled"],
        default: "pending"
      },
      settledAt: {
        type: Date
      },
      notes: {
        type: String
      }
    }
  ],

  aiPaymentNotes: {
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low"
    },
    reasons: [{ type: String }],
    recommendedAction: { type: String }
  }

}, { timestamps: true });

orderSchema.index({ deliveryLocation: "2dsphere" });

module.exports = mongoose.model("Order", orderSchema);
