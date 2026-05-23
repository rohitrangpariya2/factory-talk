import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { db } from '../../config/firebase';
import { Channel, UserRole } from '../../types';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const snapshot = await db.collection('channels').get();
    const channels = snapshot.docs.map(doc => doc.data() as Channel);
    
    // Filter channels user has access to
    const accessibleChannels = channels.filter(c => 
      c.type === 'COMMON' || c.members.includes(req.user.uid) || req.user.role === UserRole.OWNER
    );
    
    res.json(accessibleChannels);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get channels' });
  }
});

router.post('/', async (req, res) => {
  if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { name, type, department } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'Missing fields' });

  try {
    const docRef = db.collection('channels').doc();
    const channel: Channel = {
      id: docRef.id,
      name,
      type,
      department,
      members: [req.user.uid],
      createdBy: req.user.uid
    };

    await docRef.set(channel);
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

router.delete('/:id', async (req, res) => {
  if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await db.collection('channels').doc(req.params.id).delete();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

export default router;
