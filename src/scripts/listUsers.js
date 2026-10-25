import mongoose from 'mongoose';
import { User } from '../models/User.js';

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27019/hcm_lite');
  const users = await User.find();
  console.log('Total users in DB:', users.length);
  for (const u of users) {
    console.log(`Email: ${u.email} | Role: ${u.role} | TempPwd: ${u.isTempPassword}`);
  }
  await mongoose.disconnect();
}

main().catch(console.error);
