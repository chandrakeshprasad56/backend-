
const mongoose = require("mongoose");
const productSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },

  price: { 
    type: Number, 
    required: true 
  },

  category: { 
    type: String 
  },

  stock: { 
    type: Number, 
    default: 0 
  },

  image: { 
    type: String 
  },

  shop: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Shop",
    required: true
  },

  // ✅ Reviews Array
  reviews: [
    {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      name: {
        type: String
      },
      rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
      },
      comment: {
        type: String
      },
      verifiedBuyer: {
        type: Boolean,
        default: false
      },
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
        categories: [{
          type: String
        }],
        reasons: [{
          type: String
        }],
        model: {
          type: String
        },
        reviewedAt: {
          type: Date
        },
        publicVisible: {
          type: Boolean,
          default: true
        },
        ai: {
          type: mongoose.Schema.Types.Mixed
        }
      }
    }
  ],

  // ✅ Average Rating Field
  averageRating: {
    type: Number,
    default: 0
  },

  views: {
    type: Number,
    default: 0
  },
  salesCount: {
    type: Number,
    default: 0
  },
  cartAdds: {
    type: Number,
    default: 0
  },
  cartRemoves: {
    type: Number,
    default: 0
  }

}, { timestamps: true });

const SAFE_ELECTRONICS_IMAGE =
  "https://images.pexels.com/photos/40879/pexels-photo-40879.jpeg?cs=srgb&dl=pexels-pixabay-40879.jpg&fm=jpg";
const BLOCKED_IMAGE_REGEX = /(6192127|34939748)/i;

function sanitizeImageOnRead(doc) {
  if (!doc) return;
  const image = String(doc.image || "");
  const name = String(doc.name || "").toLowerCase();
  if (name === "portable ssd 1tb" || BLOCKED_IMAGE_REGEX.test(image)) {
    doc.image = SAFE_ELECTRONICS_IMAGE;
  }
}

productSchema.post("find", (docs) => {
  if (!Array.isArray(docs)) return;
  docs.forEach(sanitizeImageOnRead);
});

productSchema.post("findOne", (doc) => {
  sanitizeImageOnRead(doc);
});

module.exports = mongoose.model("Product", productSchema);
