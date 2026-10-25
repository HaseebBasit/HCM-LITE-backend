import dns from 'node:dns';
import mongoose from 'mongoose';
import { ENV } from './env.js';

// Configure high-reliability Google DNS to prevent SRV ETIMEOUT queryTxt failures on MongoDB Atlas
try {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (dnsErr) {
  console.warn('[DB] Could not set custom DNS servers:', dnsErr.message);
}

let twinServerInstance = null;

// Remove geofence fields left by older versions so location data is no longer
// stored or exposed by this application after the database reconnects.
const purgeLegacyLocationData = async () => {
  const db = mongoose.connection.db;
  if (!db) return;

  const existingCollections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name)
  );
  const cleanup = [
    ['companies', { officeLocation: 1 }],
    ['organizations', { officeLocation: 1 }],
    ['attendances', { location: 1 }],
    ['auditlogs', {
      'before.officeLocation': 1,
      'after.officeLocation': 1,
      'details.before.officeLocation': 1,
      'details.after.officeLocation': 1,
      'before.location': 1,
      'after.location': 1,
      'details.before.location': 1,
      'details.after.location': 1,
    }],
  ];

  for (const [collectionName, fields] of cleanup) {
    if (existingCollections.has(collectionName)) {
      await db.collection(collectionName).updateMany({}, { $unset: fields });
    }
  }
};

export const connectDB = async () => {
  const uri = ENV.MONGODB_URI || '';
  const hasPlaceholder = uri.includes('<db_password>') || uri.includes('<password>') || uri.includes('<username>');
  if (ENV.NODE_ENV === 'production' && (!uri || hasPlaceholder || !/^mongodb(?:\+srv)?:\/\//.test(uri))) {
    throw new Error('Configure a valid MONGO_URI before running in production.');
  }

  // 1. If valid Atlas / external URI is provided (no unfilled placeholder), try connecting
  if (uri && !hasPlaceholder && (uri.startsWith('mongodb+srv://') || uri.startsWith('mongodb://'))) {
    try {
      console.log(`[DB] Attempting connection to MongoDB (${uri.split('@')[1] || 'configured URI'})...`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('[DB] ✅ Connected to MongoDB successfully.');
      await purgeLegacyLocationData();
      console.log('[DB] Removed legacy office location fields.');
      return;
    } catch (atlasErr) {
      console.warn(`[DB] ⚠️ External MongoDB unreachable (${atlasErr.message}). Switching to Embedded Zero-Config Twin MongoDB fallback...`);
      if (ENV.NODE_ENV === 'production') throw atlasErr;
    }
  } else if (hasPlaceholder) {
    console.warn('[DB] ⚠️ MONGODB_URI contains unreplaced placeholder (<db_password>). Falling back to Embedded Zero-Config Twin MongoDB...');
    if (ENV.NODE_ENV === 'production') throw new Error('Configure a valid MONGO_URI before running in production.');
  }

  // 2. Try local port 27017 if a local mongod daemon is running
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/hcm_lite', {
      serverSelectionTimeoutMS: 1000,
    });
    console.log('[DB] ✅ Connected to local MongoDB on port 27017.');
    await purgeLegacyLocationData();
    console.log('[DB] Removed legacy office location fields.');
    return;
  } catch {
    // Local daemon not active, continue to embedded engine
  }

  // 3. Fallback to instant Embedded Zero-Config Twin MongoDB Server
  try {
    console.log('[DB] 🚀 Starting embedded Zero-Config MongoDB Engine...');
    const { createMongodbTwinServer } = await import('@volter/twin-mongodb');
    twinServerInstance = await createMongodbTwinServer({ port: 27019 });
    const localUri = `${twinServerInstance.url}/hcm_lite`;
    console.log(`[DB] Embedded MongoDB running on port ${twinServerInstance.port}`);

    await mongoose.connect(localUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[DB] ✅ Connected to Embedded MongoDB Engine successfully.');
    await purgeLegacyLocationData();
    console.log('[DB] Removed legacy office location fields.');
  } catch (embeddedErr) {
    console.error('[DB] ⚠️ Embedded MongoDB failed to bind:', embeddedErr.message);
    console.warn('[DB] Express server will continue running gracefully.');
  }

  mongoose.connection.on('error', (err) => {
    console.error('[DB] Mongoose runtime error:', err.message);
  });
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    if (twinServerInstance && typeof twinServerInstance.stop === 'function') {
      await twinServerInstance.stop();
    }
  } catch (err) {
    console.warn('[DB] Disconnect warning:', err.message);
  }
};
