import mongoose from 'mongoose';

async function inspectAndWipe(wipe = false) {
  await mongoose.connect('mongodb://127.0.0.1:27019/hcm_lite');
  const collections = await mongoose.connection.db.listCollections().toArray();
  console.log('Current Collections:');
  for (const c of collections) {
    const count = await mongoose.connection.collection(c.name).countDocuments();
    console.log(`- ${c.name}: ${count} documents`);
    if (wipe) {
      await mongoose.connection.collection(c.name).deleteMany({});
      console.log(`  -> Cleared ${c.name}`);
    }
  }
  await mongoose.disconnect();
}

const shouldWipe = process.argv.includes('--wipe');
inspectAndWipe(shouldWipe).catch(console.error);

