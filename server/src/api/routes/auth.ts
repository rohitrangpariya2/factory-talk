import { Router } from 'express';
import { auth, db } from '../../config/firebase';
import { UserRole } from '../../types';

const router = Router();

router.post('/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const doc = await db.collection('users').doc(decodedToken.uid).get();
    
    if (doc.exists) {
      return res.json({ user: doc.data() });
    } else {
      return res.json({ isNewUser: true, uid: decodedToken.uid, phone: decodedToken.phone_number });
    }
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/register', async (req, res) => {
  const { token, displayName } = req.body;
  if (!token || !displayName) return res.status(400).json({ error: 'Missing fields' });

  try {
    const decodedToken = await auth.verifyIdToken(token);
    
    // Make the first user the OWNER
    const usersSnapshot = await db.collection('users').limit(1).get();
    const role = usersSnapshot.empty ? UserRole.OWNER : UserRole.WORKER;

    const user = {
      id: decodedToken.uid,
      phoneNumber: decodedToken.phone_number || '',
      displayName,
      role,
      isOnline: false,
      lastSeen: Date.now(),
      channels: ['common-channel-id'], // Will be populated properly later
      permissions: { canTalk: true, canPrivateTalk: true },
      isMuted: false,
      isBlocked: false,
      createdAt: Date.now()
    };

    await db.collection('users').doc(decodedToken.uid).set(user);
    
    return res.json({ user });
  } catch (error) {
    return res.status(500).json({ error: 'Registration failed' });
  }
});

export default router;
