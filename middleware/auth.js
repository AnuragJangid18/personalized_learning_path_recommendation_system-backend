// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret';

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // payload should contain userId
    const user = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = { id: user._id.toString(), studentId: user.studentId?.toString() || null, email: user.email };
    next();
  } catch (e) {
    console.error('auth error', e);
    return res.status(401).json({ error: 'Invalid/expired token' });
  }
}

module.exports = { authMiddleware, JWT_SECRET };
