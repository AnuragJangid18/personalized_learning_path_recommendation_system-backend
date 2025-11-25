// backend/models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' } // links to Student doc
}, { timestamps: true });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
