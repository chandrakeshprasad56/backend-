const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role
});

const signToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// REGISTER (JWT)
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      name,
      email,
      password,
      role: role === "seller" ? "seller" : "buyer"
    });

    const token = signToken(user);
    res.status(201).json({ message: "User registered successfully", token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGIN (JWT)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid email" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = signToken(user);
    res.json({ message: "Login successful", token, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// LOGOUT (client clears token)
exports.logout = async (req, res) => {
  res.json({ message: "Logged out successfully" });
};

// ME
exports.me = async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }
  res.json({ user: sanitizeUser(user) });
};
