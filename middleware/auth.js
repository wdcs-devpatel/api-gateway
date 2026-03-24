const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {

  const authHeader = req.headers.authorization;

  console.log(`[Gateway Auth] Method: ${req.method} URL: ${req.url}`);
  console.log(`[Gateway Auth] Authorization Header:`, authHeader);
  console.log(`[Gateway Auth] All Headers:`, JSON.stringify(req.headers, null, 2));

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log(`[Gateway Auth] ❌ No token or invalid format. returning 401`);
    return res.status(401).json({ message: "No token provided: Authorization required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "c99b21841b7d3f36a1a44105845d2b37fb543c362a2427001f58506809d445f8");
    
    req.user = {  
      id: decoded.id,
      role: decoded.role || "user" 
    };

    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

module.exports = verifyToken;
