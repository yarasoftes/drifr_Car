const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  password: { type: String, required: true, minlength: 6 },
  score: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

userSchema.methods.comparePassword = function(pwd) {
  return this.password === pwd;
};

module.exports = mongoose.model('User', userSchema);