import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { getAllUsers, getUserById, updateUserRole } from '../../services/userService';
import { UserRole } from '../../types';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get users' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.put('/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!Object.values(UserRole).includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Only OWNER or ADMIN can change roles
  if (req.user.role !== UserRole.OWNER && req.user.role !== UserRole.ADMIN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Only OWNER can make someone else an OWNER or ADMIN
  if ((role === UserRole.OWNER || role === UserRole.ADMIN) && req.user.role !== UserRole.OWNER) {
    return res.status(403).json({ error: 'Only Owner can grant Admin/Owner roles' });
  }

  try {
    await updateUserRole(req.params.id, role as UserRole, req.user.uid);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

export default router;
