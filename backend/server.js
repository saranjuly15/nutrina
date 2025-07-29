const express = require('express');
const cors = require('cors');
const app = express();
const nutritionRoutes = require('./routes/nutritionRoutes');

const dotenv = require('dotenv');
dotenv.config();

app.use(cors());
app.use(express.json());

app.use('/api', nutritionRoutes);

app.get('/', (req, res) => {
  res.send('Nutrina backend running!');
});

const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log("Connected to MongoDB successfully");
})
.catch((err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected');
});

// Add global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});