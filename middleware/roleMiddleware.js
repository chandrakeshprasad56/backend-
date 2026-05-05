// middleware/roleMiddleware.js

const role = (...allowedRoles) => {
  return (req, res, next) => {

    // Check if user exists (from auth middleware)
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized - Please login"
      });
    }

    // Check if user role is allowed
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied - You do not have permission"
      });
    }

    // If everything is fine
    next();
  };
};

module.exports = role;
