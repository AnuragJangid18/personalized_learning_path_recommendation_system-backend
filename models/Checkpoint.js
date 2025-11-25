// backend/models/Checkpoint.js
const mongoose = require('mongoose');

const checkpointSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: 'checkpoint' },
  snapshot: { type: Object, default: {} }, // store full snapshot: { student, completed, stats, currentLesson, lessonState, createdAt }
}, { timestamps: true });

module.exports = mongoose.models.Checkpoint || mongoose.model('Checkpoint', checkpointSchema);
