const express = require("express");
const bcrypt = require("bcryptjs");
const auth = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const User = require("../models/User");

const router = express.Router();

// Get current user
router.get("/me", auth, async (req, res) => {
  res.json({ user: req.user });
});

// Update profile
router.put("/update", auth, upload.single("avatar"), async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      address: req.body.address
    };

    if (req.file) {
      updates.avatar = `/uploads/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true })
      .select("-password");

    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: "Update failed", error: err.message });
  }
});

// Change password
router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password required" });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Password change failed", error: err.message });
  }
});

module.exports = router;
