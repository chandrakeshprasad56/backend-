
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  address: { type: String },
  avatar: { type: String },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["buyer", "seller", "admin"],
    default: "buyer"
  }
}, { timestamps: true });

userSchema.pre("save", async function() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
