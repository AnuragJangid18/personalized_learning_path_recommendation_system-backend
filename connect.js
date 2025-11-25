const mongoose = require('mongoose');

// Use environment variable when available (Vercel sets this in project settings)
const DEFAULT_URI = 'mongodb+srv://personalized_learning_path_recommendation_system:plprs123@anuragapi.lqyfynk.mongodb.net/?appName=AnuragAPI';

/**
 * Connect to MongoDB Atlas with a cached connection for serverless environments.
 * - Uses process.env.MONGO_URI when provided (recommended for production).
 * - Avoids creating a new connection on every invocation by reusing mongoose's connection state.
 */
const connectDB = async () => {
    const uri = process.env.MONGO_URI || DEFAULT_URI;
    if (!uri) {
        throw new Error('MONGO_URI is not set');
    }

    // If already connected, reuse the existing connection
    if (mongoose.connection && mongoose.connection.readyState === 1) {
        return mongoose;
    }

    // Return the connection promise
    return mongoose.connect(uri);
};

module.exports = connectDB;