const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkPyramidQuestion() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const questions = db.collection('questions');
  
  const q = await questions.findOne({ title: /金字塔/ });
  
  if (q) {
    console.log('=== Sample Output ===');
    const sample1 = q.samples?.[0];
    if (sample1) {
      const output = sample1.output;
      console.log('Raw JSON:', JSON.stringify(output));
      console.log('');
      console.log('Visual (· for space, ↵ for newline):');
      console.log(output.split('').map(c => c === ' ' ? '·' : c === '\n' ? '↵\n' : c).join(''));
      console.log('');
      console.log('First char is space?', output[0] === ' ');
      console.log('First char code:', output.charCodeAt(0));
    }
  }
  
  await mongoose.disconnect();
}

checkPyramidQuestion().catch(console.error);
